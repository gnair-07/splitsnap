import type { ParsedReceipt, Participant, SplitCalculationResponse } from "../types/receipt";
import { toCents } from "../utils/mathEngine";
import { fmt } from "../utils/format";

interface Props {
  receipt: ParsedReceipt;
  participants: Participant[];
  local: SplitCalculationResponse;
  verified: SplitCalculationResponse | null;
  onSettle: () => void;
}

export default function ReconciliationPanel({ receipt, participants, local, verified, onSettle }: Props) {
  const cur = receipt.currency;
  const result = verified ?? local; // the server's numbers win once they arrive
  const mismatch =
    verified !== null &&
    local.breakdowns.some((b) => {
      const v = verified.breakdowns.find((x) => x.participant_id === b.participant_id);
      return !v || toCents(v.final_amount) !== toCents(b.final_amount);
    });
  const anyAssigned = result.calculated_sum > 0;
  const colorOf = (id: string) => participants.find((p) => p.id === id)?.avatar_color ?? "#64748b";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-4">
      <h2 className="mb-3 text-base font-semibold text-slate-900">4. Who owes what</h2>

      <dl className="mb-3 space-y-1 text-sm text-slate-700">
        <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{fmt(cur, receipt.subtotal)}</dd></div>
        <div className="flex justify-between"><dt>Tax &amp; fees</dt><dd className="tabular-nums">{fmt(cur, receipt.tax + receipt.service_charge + receipt.tip)}</dd></div>
        {receipt.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd className="tabular-nums">−{fmt(cur, receipt.discount)}</dd></div>}
        <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900"><dt>Grand total</dt><dd className="tabular-nums">{fmt(cur, receipt.grand_total)}</dd></div>
      </dl>

      <ul className="divide-y divide-slate-100">
        {result.breakdowns.map((b) => (
          <li key={b.participant_id} className="py-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 font-medium text-slate-900">
                <span className="h-3 w-3 rounded-full" style={{ background: colorOf(b.participant_id) }} />
                {b.name}
                {b.is_organizer && <span className="rounded bg-slate-100 px-1.5 text-xs font-normal text-slate-600">paid the bill</span>}
              </span>
              <span className="text-lg font-semibold tabular-nums text-slate-900">{fmt(cur, b.final_amount)}</span>
            </div>
            {b.assigned_items.length > 0 && (
              <p className="mt-0.5 text-xs text-slate-500">
                {b.assigned_items.join(", ")} · items {fmt(cur, b.raw_subtotal)} + tax {fmt(cur, b.proportional_tax)} + service/tip {fmt(cur, b.proportional_fees_and_tips)}
                {b.proportional_discount > 0 && ` − discount ${fmt(cur, b.proportional_discount)}`}
              </p>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-2">
        {result.is_balanced ? (
          <div className="rounded-lg bg-emerald-50 p-2.5 text-sm font-medium text-emerald-800">
            ✅ Balanced: {fmt(cur, result.calculated_sum)} / {fmt(cur, result.receipt_total)}
          </div>
        ) : anyAssigned ? (
          <div className="rounded-lg bg-amber-50 p-2.5 text-sm font-medium text-amber-900">
            ⚠ {fmt(cur, result.unassigned_amount)} still unassigned (including its share of tax and fees)
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 p-2.5 text-sm text-slate-700">Assign items to people to see who owes what.</div>
        )}
        {result.receipt_adjustment !== 0 && (
          <div className="rounded-lg bg-sky-50 p-2.5 text-xs text-sky-900">
            The receipt total differs from its line items by {fmt(cur, Math.abs(result.receipt_adjustment))}; it has been spread proportionally.
          </div>
        )}
        {mismatch && <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800">Engine mismatch between app and server. Showing the server's numbers.</div>}
      </div>

      <button
        onClick={onSettle}
        disabled={!result.is_balanced || participants.length < 2}
        className="mt-3 w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ⚡ Settle up &amp; QR
      </button>
      {!result.is_balanced && <p className="mt-1 text-center text-xs text-slate-500">Assign every item to enable settlement.</p>}
    </section>
  );
}
