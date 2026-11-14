"""Run from server/:  python test_split_engine.py   (no pytest needed)"""
from mock_data import MOCK_RECEIPTS
from models import Participant
from receipt_parser import validate_receipt
from split_engine import allocate, calculate_reconciliation, to_cents

P = [
    Participant(id="p1", name="Alex", avatar_color="#3B82F6", upi_id="alex@okaxis", paypal_handle="alexpay"),
    Participant(id="p2", name="Sarah", avatar_color="#EC4899"),
    Participant(id="p3", name="David", avatar_color="#10B981"),
]
ALL = ["p1", "p2", "p3"]


def total_cents(res):
    return sum(to_cents(b.final_amount) for b in res.breakdowns)


def test_allocate_exact():
    for total in (0, 1, 2, 99, 1000, 16459):
        for w in ([1, 1, 1], [3, 1, 1], [0, 5, 0], [7, 11, 13]):
            assert sum(allocate(total, w)) == total
    assert allocate(-5, [1, 1, 1]) == [-2, -2, -1][::-1] or sum(allocate(-5, [1, 1, 1])) == -5


def test_presets_are_self_consistent():
    for name, r in MOCK_RECEIPTS.items():
        assert validate_receipt(r) == [], f"{name} preset is inconsistent: {validate_receipt(r)}"


def test_fully_assigned_dinner_balances_to_the_cent():
    r = MOCK_RECEIPTS["dinner"]
    assign = {
        "item_1": ["p3"], "item_2": ["p2"], "item_3": ["p1"],
        "item_4": ALL,  # shared wine
        "item_5": ["p3"],
    }
    res = calculate_reconciliation(r, P, assign, organizer_id="p1")
    assert res.is_balanced and res.unassigned_amount == 0
    assert total_cents(res) == to_cents(r.grand_total)
    assert res.receipt_adjustment == 0
    return res


def test_unassigned_items_are_not_dumped_on_anyone():
    r = MOCK_RECEIPTS["dinner"]
    res = calculate_reconciliation(r, P, {"item_3": ["p1"]}, organizer_id="p1")
    assert not res.is_balanced
    assert res.unassigned_amount > 0
    assert total_cents(res) + to_cents(res.unassigned_amount) == to_cents(r.grand_total)
    # Alex only ate the pasta: his bill must be far below the whole receipt
    assert next(b for b in res.breakdowns if b.participant_id == "p1").final_amount < 60


def test_nothing_assigned():
    r = MOCK_RECEIPTS["cafe"]
    res = calculate_reconciliation(r, P, {})
    assert not res.is_balanced
    assert all(b.final_amount == 0 for b in res.breakdowns)
    assert res.unassigned_amount == r.grand_total


def test_custom_shares():
    r = MOCK_RECEIPTS["dinner"]
    assign = {f"item_{i}": ALL for i in range(1, 6)}
    res = calculate_reconciliation(r, P, assign, custom_shares={"item_4": {"p1": 2, "p2": 1}})
    assert res.is_balanced and total_cents(res) == to_cents(r.grand_total)


def test_receipt_roundoff_is_spread_and_reported():
    r = MOCK_RECEIPTS["grocery"].model_copy(update={"grand_total": 34.71})  # receipt has a 1-cent round-off
    res = calculate_reconciliation(r, P, {f"item_{i}": ALL for i in range(1, 6)})
    assert res.is_balanced and res.receipt_adjustment == 0.01
    assert total_cents(res) == 3471


def test_payment_links():
    r = MOCK_RECEIPTS["cafe"]  # INR
    res = calculate_reconciliation(r, P, {f"item_{i}": ALL for i in range(1, 5)}, organizer_id="p1")
    alex, sarah = res.breakdowns[0], res.breakdowns[1]
    assert alex.is_organizer and alex.payment_link_upi == "" and alex.payment_link_paypal == ""
    assert sarah.payment_link_upi.startswith("upi://pay?pa=alex@okaxis&pn=Alex&am=")
    assert "cu=INR" in sarah.payment_link_upi
    d = calculate_reconciliation(MOCK_RECEIPTS["dinner"], P, {f"item_{i}": ALL for i in range(1, 6)}, organizer_id="p1")
    assert d.breakdowns[1].payment_link_upi == ""  # USD bill: no UPI link
    assert d.breakdowns[1].payment_link_paypal.startswith("https://paypal.me/alexpay/")
    assert d.breakdowns[1].payment_link_paypal.endswith("USD")


def test_bad_input():
    r = MOCK_RECEIPTS["dinner"]
    for bad in ({"item_1": ["nobody"]},):
        try:
            calculate_reconciliation(r, P, bad)
            raise AssertionError("expected ValueError")
        except ValueError:
            pass


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("PASS", name)
    res = test_fully_assigned_dinner_balances_to_the_cent()
    for b in res.breakdowns:
        print(f"  {b.name:6} base {b.raw_subtotal:6.2f} tax {b.proportional_tax:5.2f} fees {b.proportional_fees_and_tips:5.2f} => {b.final_amount:6.2f}")
    print("  total", res.calculated_sum, "of", res.receipt_total)
