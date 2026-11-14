import { Minus, Plus } from "lucide-react";
import type { ParsedReceipt, Participant } from "../types/receipt";
import { toCents } from "../utils/mathEngine";
import { fmt } from "../utils/format";

interface Props {
  receipt: ParsedReceipt;
  participants: Participant[];
  assignments: Record<string, string[]>;
  customShares: Record<string, Record<string, number>>;
  onToggle: (itemId: string, participantId: string) => void;
  onAll: (itemId: string) => void;
  onCustomEnable: (itemId: string) => void;
  onCustomChange: (itemId: string, participantId: string, weight: number) => void;
  onCustomDisable: (itemId: string) => void;
}

export default function ItemAssignmentGrid(p: Props) {
  const { receipt, participants, assignments, customShares } = p;
  const cur = receipt.currency;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-slate-900">3. Who had what?</h2>
        <span className="text-sm text-slate-600">
          {receipt.merchant} · {fmt(cur, receipt.grand_total)}
        </span>
      </div>

      <div className="space-y-3">
        {receipt.items.map((item) => {
          const custom = customShares[item.id];
          const assigned = (assignments[item.id] ?? []).filter((id) => participants.some((m) => m.id === id));
          const priceCents = toCents(item.price);

          let hint: string;
          let unassigned = false;
          if (custom) {
            const totalW = participants.reduce((s, m) => s + (custom[m.id] ?? 0), 0);
            hint = totalW > 0 ? "Custom split by weight" : "Give at least one person a share";
            unassigned = totalW <= 0;
          } else if (assigned.length === 0) {
            hint = "Not assigned yet";
            unassigned = true;
          } else {
            const each = priceCents / assigned.length / 100;
            const exact = priceCents % assigned.length === 0;
            hint = `Split ${assigned.length} way${assigned.length > 1 ? "s" : ""} (${exact ? "" : "≈ "}${fmt(cur, each)}/ea)`;
          }

          return (
            <div key={item.id} className={`rounded-xl border p-3 ${unassigned ? "border-amber-300 bg-amber-50/50" : "border-slate-200"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-slate-900">
                  {item.name}
                  {item.quantity > 1 && <span className="ml-1 text-sm text-slate-500">×{item.quantity}</span>}
                </span>
                <span className="tabular-nums text-slate-900">{fmt(cur, item.price)}</span>
              </div>

              {custom ? (
                <div className="mt-2 flex flex-wrap gap-3">
                  {participants.map((m) => {
                    const w = custom[m.id] ?? 0;
                    return (
                      <div key={m.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-sm">
                        <span className="h-3 w-3 rounded-full" style={{ background: m.avatar_color }} />
                        {m.name}
                        <button aria-label={`Less for ${m.name}`} disabled={w <= 0} onClick={() => p.onCustomChange(item.id, m.id, w - 1)} className="rounded p-0.5 disabled:opacity-30">
                          <Minus size={14} />
                        </button>
                        <span className="w-4 text-center tabular-nums">{w}</span>
                        <button aria-label={`More for ${m.name}`} disabled={w >= 9} onClick={() => p.onCustomChange(item.id, m.id, w + 1)} className="rounded p-0.5 disabled:opacity-30">
                          <Plus size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {participants.map((m) => {
                    const on = assigned.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        aria-pressed={on}
                        onClick={() => p.onToggle(item.id, m.id)}
                        className="rounded-full border-2 px-3 py-1 text-sm font-medium"
                        style={on ? { background: m.avatar_color, borderColor: m.avatar_color, color: "#fff" } : { borderColor: m.avatar_color, color: "#1e293b" }}
                      >
                        {m.name}
                      </button>
                    );
                  })}
                  <button onClick={() => p.onAll(item.id)} className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50">
                    Split between all
                  </button>
                </div>
              )}

              <div className="mt-2 flex items-center justify-between">
                <small className={unassigned ? "text-amber-800" : "text-slate-500"}>{unassigned ? "⚠ " : ""}{hint}</small>
                {custom ? (
                  <button onClick={() => p.onCustomDisable(item.id)} className="text-xs text-indigo-700 underline">
                    Back to equal split
                  </button>
                ) : (
                  <button onClick={() => p.onCustomEnable(item.id)} className="text-xs text-indigo-700 underline">
                    Custom split
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
