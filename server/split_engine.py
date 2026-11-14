"""Proportional receipt reconciliation.

All money is handled as INTEGER CENTS and split with the largest-remainder method,
so results are exact and identical to client/src/utils/mathEngine.ts.
"""
from decimal import ROUND_HALF_UP, Decimal
from typing import Dict, List, Optional
from urllib.parse import quote

from models import (
    ParsedReceipt,
    Participant,
    ParticipantBreakdown,
    SplitCalculationResponse,
)

WEIGHT_SCALE = 1000  # custom weights are kept to 3 decimal places

CURRENCY_CODES = {
    "$": "USD", "USD": "USD",
    "₹": "INR", "INR": "INR", "RS": "INR", "RS.": "INR",
    "€": "EUR", "EUR": "EUR",
    "£": "GBP", "GBP": "GBP",
}


def to_cents(amount: float) -> int:
    return int((Decimal(str(amount)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def from_cents(cents: int) -> float:
    return round(cents / 100, 2)


def to_weight(value: float) -> int:
    return int((Decimal(str(value)) * WEIGHT_SCALE).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def allocate(total_cents: int, weights: List[int]) -> List[int]:
    """Split total_cents proportionally to integer weights; result always sums to total_cents."""
    n = len(weights)
    weight_sum = sum(weights)
    if n == 0 or total_cents == 0 or weight_sum <= 0:
        return [0] * n
    if total_cents < 0:
        return [-x for x in allocate(-total_cents, weights)]
    numerators = [total_cents * w for w in weights]
    shares = [num // weight_sum for num in numerators]
    remainders = [num % weight_sum for num in numerators]
    leftover = total_cents - sum(shares)
    order = sorted(range(n), key=lambda i: (-remainders[i], i))
    for i in order[:leftover]:
        shares[i] += 1
    return shares


def currency_code(symbol: str) -> Optional[str]:
    return CURRENCY_CODES.get((symbol or "").strip().upper()) or CURRENCY_CODES.get((symbol or "").strip())


def build_upi_link(organizer: Participant, amount_cents: int) -> str:
    upi_id = (organizer.upi_id or "").strip()
    if not upi_id or amount_cents <= 0:
        return ""
    return (
        f"upi://pay?pa={quote(upi_id, safe='@.-_')}"
        f"&pn={quote(organizer.name, safe='')}"
        f"&am={amount_cents / 100:.2f}&cu=INR"
        f"&tn={quote('SplitSnap Settlement', safe='')}"
    )


def build_paypal_link(organizer: Participant, amount_cents: int, code: Optional[str]) -> str:
    handle = (organizer.paypal_handle or "").strip().rstrip("/")
    if "paypal.me/" in handle:
        handle = handle.split("paypal.me/")[-1].split("/")[0]
    handle = handle.lstrip("@")
    if not handle or amount_cents <= 0:
        return ""
    return f"https://paypal.me/{quote(handle, safe='')}/{amount_cents / 100:.2f}{code or ''}"


def calculate_reconciliation(
    receipt: ParsedReceipt,
    participants: List[Participant],
    assignments: Dict[str, List[str]],
    custom_shares: Optional[Dict[str, Dict[str, float]]] = None,
    organizer_id: Optional[str] = None,
) -> SplitCalculationResponse:
    custom_shares = custom_shares or {}
    ids = [p.id for p in participants]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate participant ids")
    known = set(ids)
    if organizer_id is not None and organizer_id not in known:
        raise ValueError(f"Unknown organizer_id: {organizer_id}")

    # 1. Split every line item (integer cents, largest-remainder)
    consumption: Dict[str, int] = {pid: 0 for pid in ids}
    item_names: Dict[str, List[str]] = {pid: [] for pid in ids}
    unassigned_items_cents = 0
    items_total_cents = 0

    for item in receipt.items:
        price = to_cents(item.price)
        items_total_cents += price
        weights_map = custom_shares.get(item.id)
        if weights_map:
            shares = {uid: to_weight(w) for uid, w in weights_map.items() if to_weight(w) > 0}
        else:
            shares = {uid: WEIGHT_SCALE for uid in dict.fromkeys(assignments.get(item.id) or [])}
        unknown = [uid for uid in shares if uid not in known]
        if unknown:
            raise ValueError(f"Item {item.id} assigned to unknown participant(s): {unknown}")
        if not shares:
            unassigned_items_cents += price
            continue
        uid_list = list(shares)
        for uid, cents in zip(uid_list, allocate(price, [shares[u] for u in uid_list])):
            consumption[uid] += cents
            item_names[uid].append(item.name)

    # 2. Receipt-level amounts, in cents
    tax_c = to_cents(receipt.tax)
    fees_c = to_cents(receipt.service_charge) + to_cents(receipt.tip)
    disc_c = to_cents(receipt.discount)
    expected_total_c = to_cents(receipt.grand_total)
    # Whatever the receipt total says beyond items + tax + fees - discount (round-off lines, OCR slips)
    adjustment_c = expected_total_c - (items_total_cents + tax_c + fees_c - disc_c)

    # 3. Allocate overheads proportionally. An extra "unassigned" bucket soaks up its fair share
    #    so a half-assigned receipt never inflates anyone's bill.
    weights = [consumption[pid] for pid in ids] + [unassigned_items_cents]
    tax_a = allocate(tax_c, weights)
    fees_a = allocate(fees_c, weights)
    disc_a = allocate(disc_c, weights)
    adj_a = allocate(adjustment_c, weights)

    organizer = next((p for p in participants if p.id == organizer_id), None)
    code = currency_code(receipt.currency)

    breakdowns: List[ParticipantBreakdown] = []
    for idx, p in enumerate(participants):
        final_c = consumption[p.id] + tax_a[idx] + fees_a[idx] - disc_a[idx] + adj_a[idx]
        is_org = organizer is not None and p.id == organizer.id
        upi = paypal = ""
        if organizer is not None and not is_org:
            if code == "INR":
                upi = build_upi_link(organizer, final_c)
            paypal = build_paypal_link(organizer, final_c, code)
        breakdowns.append(
            ParticipantBreakdown(
                participant_id=p.id,
                name=p.name,
                raw_subtotal=from_cents(consumption[p.id]),
                proportional_tax=from_cents(tax_a[idx]),
                proportional_fees_and_tips=from_cents(fees_a[idx]),
                proportional_discount=from_cents(disc_a[idx]),
                proportional_adjustment=from_cents(adj_a[idx]),
                final_amount=from_cents(final_c),
                assigned_items=item_names[p.id],
                is_organizer=is_org,
                payment_link_upi=upi,
                payment_link_paypal=paypal,
            )
        )

    final_sum_c = sum(to_cents(b.final_amount) for b in breakdowns)
    unassigned_c = expected_total_c - final_sum_c
    return SplitCalculationResponse(
        is_balanced=(unassigned_c == 0),
        receipt_total=from_cents(expected_total_c),
        calculated_sum=from_cents(final_sum_c),
        unassigned_amount=from_cents(unassigned_c),
        receipt_adjustment=from_cents(adjustment_c),
        breakdowns=breakdowns,
    )
