// Client mirror of server/split_engine.py. Integer cents + largest-remainder allocation,
// so the live UI and the backend verification always agree to the cent.
import type {
  ParsedReceipt,
  Participant,
  ParticipantBreakdown,
  SplitCalculationResponse,
} from "../types/receipt";

export const WEIGHT_SCALE = 1000;

export const toCents = (amount: number): number => Math.round((amount + Number.EPSILON) * 100);
export const fromCents = (cents: number): number => Math.round(cents) / 100;
const toWeight = (w: number): number => Math.round(w * WEIGHT_SCALE);

export function allocate(totalCents: number, weights: number[]): number[] {
  const n = weights.length;
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (n === 0 || totalCents === 0 || weightSum <= 0) return new Array<number>(n).fill(0);
  if (totalCents < 0) return allocate(-totalCents, weights).map((x) => -x);
  const numerators = weights.map((w) => totalCents * w);
  const remainders = numerators.map((num) => num % weightSum);
  const shares = numerators.map((num, i) => (num - remainders[i]) / weightSum); // exact integer division
  const leftover = totalCents - shares.reduce((a, b) => a + b, 0);
  const order = weights
    .map((_, i) => i)
    .sort((a, b) => remainders[b] - remainders[a] || a - b);
  for (const i of order.slice(0, leftover)) shares[i] += 1;
  return shares;
}

export function computeSplit(
  receipt: ParsedReceipt,
  participants: Participant[],
  assignments: Record<string, string[]>,
  customShares: Record<string, Record<string, number>> = {},
  organizerId: string | null = null,
): SplitCalculationResponse {
  const ids = participants.map((p) => p.id);
  const known = new Set(ids);
  const consumption: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const names: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, [] as string[]]));
  let unassignedItemsCents = 0;
  let itemsTotalCents = 0;

  for (const item of receipt.items) {
    const price = toCents(item.price);
    itemsTotalCents += price;
    const custom = customShares[item.id];
    let shares: [string, number][];
    if (custom && Object.keys(custom).length > 0) {
      shares = Object.entries(custom).map(([uid, w]) => [uid, toWeight(w)] as [string, number]).filter(([, w]) => w > 0);
    } else {
      shares = Array.from(new Set(assignments[item.id] ?? [])).map((uid) => [uid, WEIGHT_SCALE] as [string, number]);
    }
    shares = shares.filter(([uid]) => known.has(uid)); // ignore stale ids after members are removed
    if (shares.length === 0) {
      unassignedItemsCents += price;
      continue;
    }
    const parts = allocate(price, shares.map(([, w]) => w));
    shares.forEach(([uid], i) => {
      consumption[uid] += parts[i];
      names[uid].push(item.name);
    });
  }

  const taxC = toCents(receipt.tax);
  const feesC = toCents(receipt.service_charge) + toCents(receipt.tip);
  const discC = toCents(receipt.discount);
  const expectedC = toCents(receipt.grand_total);
  const adjustmentC = expectedC - (itemsTotalCents + taxC + feesC - discC);

  const weights = [...ids.map((id) => consumption[id]), unassignedItemsCents];
  const taxA = allocate(taxC, weights);
  const feesA = allocate(feesC, weights);
  const discA = allocate(discC, weights);
  const adjA = allocate(adjustmentC, weights);

  const breakdowns: ParticipantBreakdown[] = participants.map((p, idx) => {
    const finalC = consumption[p.id] + taxA[idx] + feesA[idx] - discA[idx] + adjA[idx];
    return {
      participant_id: p.id,
      name: p.name,
      raw_subtotal: fromCents(consumption[p.id]),
      proportional_tax: fromCents(taxA[idx]),
      proportional_fees_and_tips: fromCents(feesA[idx]),
      proportional_discount: fromCents(discA[idx]),
      proportional_adjustment: fromCents(adjA[idx]),
      final_amount: fromCents(finalC),
      assigned_items: names[p.id],
      is_organizer: p.id === organizerId,
      payment_link_upi: "", // links come from the backend response / deepLinks.ts
      payment_link_paypal: "",
    };
  });

  const finalSumC = breakdowns.reduce((s, b) => s + toCents(b.final_amount), 0);
  const unassignedC = expectedC - finalSumC;
  return {
    is_balanced: unassignedC === 0,
    receipt_total: fromCents(expectedC),
    calculated_sum: fromCents(finalSumC),
    unassigned_amount: fromCents(unassignedC),
    receipt_adjustment: fromCents(adjustmentC),
    breakdowns,
  };
}
