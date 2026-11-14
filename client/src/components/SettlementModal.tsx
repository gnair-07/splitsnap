import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { ParsedReceipt, Participant, SplitCalculationResponse } from "../types/receipt";
import { fmt } from "../utils/format";
import { paypalLink, upiLink, whatsappSummary } from "../utils/deepLinks";

interface Props {
  open: boolean;
  onClose: () => void;
  receipt: ParsedReceipt;
  participants: Participant[];
  organizerId: string | null;
  result: SplitCalculationResponse;
}

export default function SettlementModal({ open, onClose, receipt, participants, organizerId, result }: Props) {
  const organizer = participants.find((p) => p.id === organizerId);
  const payers = result.breakdowns.filter((b) => b.participant_id !== organizerId);
  const [tabId, setTabId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTabId((cur) => (cur && payers.some((b) => b.participant_id === cur) ? cur : payers[0]?.participant_id ?? null));
    setCopied(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !organizer) return null;

  const cur = receipt.currency;
  const selected = payers.find((b) => b.participant_id === tabId) ?? payers[0];
  const upi = selected ? upiLink(organizer, selected.final_amount, cur) : "";
  const pp = selected ? paypalLink(organizer, selected.final_amount, cur) : "";
  const qrValue = upi || pp;

  const summary = whatsappSummary(
    receipt.merchant,
    cur,
    result.receipt_total,
    result.breakdowns.map((b) => ({ name: b.name, amount: b.final_amount })),
    organizer,
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
    } catch {
      setCopied(false);
      window.prompt("Copy this message:", summary);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Settle up">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Settle up with {organizer.name}</h2>
            <p className="text-xs text-slate-500">{organizer.name} paid the bill. Everyone else pays {organizer.name}.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100">✕</button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {payers.map((b) => (
            <button
              key={b.participant_id}
              onClick={() => setTabId(b.participant_id)}
              className={`rounded-full border px-3 py-1 text-sm ${b.participant_id === selected?.participant_id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-800"}`}
            >
              {b.name}
            </button>
          ))}
        </div>

        {selected && (
          <div className="text-center">
            <p className="text-sm text-slate-600">{selected.name} pays</p>
            <p className="mb-3 text-3xl font-bold tabular-nums text-slate-900">{fmt(cur, selected.final_amount)}</p>
            {qrValue ? (
              <>
                <div className="mx-auto inline-block rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <QRCodeSVG value={qrValue} size={176} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{upi ? "Scan with any UPI app" : "Scan to open PayPal"}</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {upi && <a href={upi} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Pay via UPI app</a>}
                  {pp && <a href={pp} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white">Pay via PayPal</a>}
                </div>
              </>
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                Add a UPI ID (for ₹ bills) or a PayPal.me handle for {organizer.name} in step 2 to get a QR code and payment links.
              </p>
            )}
          </div>
        )}

        <div className="mt-5">
          <h3 className="mb-1 text-sm font-semibold text-slate-900">Message for the group</h3>
          <textarea readOnly value={summary} className="h-40 w-full rounded-lg border border-slate-300 p-2 font-mono text-xs text-slate-800" />
          <button onClick={copy} className="mt-2 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            {copied ? "Copied ✓" : "Copy WhatsApp summary"}
          </button>
        </div>
      </div>
    </div>
  );
}
