import { RotateCcw } from "lucide-react";

interface Props {
  onReset: () => void;
  hasReceipt: boolean;
}

export default function Navbar({ onReset, hasReceipt }: Props) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">🧾 SplitSnap</h1>
          <p className="text-xs text-slate-500">Snap the bill. Split it fairly. Settle in one tap.</p>
        </div>
        {hasReceipt && (
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw size={14} /> New bill
          </button>
        )}
      </div>
    </header>
  );
}
