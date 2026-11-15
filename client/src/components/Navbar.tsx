import { LogOut, RotateCcw } from "lucide-react";
import type { User } from "../types/receipt";

interface Props {
  onReset: () => void;
  hasReceipt: boolean;
  user: User | null;
  authEnabled: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export default function Navbar({ onReset, hasReceipt, user, authEnabled, onSignIn, onSignOut }: Props) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900">🧾 SplitSnap</h1>
          <p className="hidden text-xs text-slate-500 sm:block">Snap the bill. Split it fairly. Settle in one tap.</p>
        </div>
        <div className="flex items-center gap-2">
          {hasReceipt && (
            <button onClick={onReset} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              <RotateCcw size={14} /> New bill
            </button>
          )}
          {authEnabled &&
            (user ? (
              <button onClick={onSignOut} title={user.email} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-5 w-5 rounded-full" /> : null}
                <span className="hidden max-w-[8rem] truncate sm:inline">{user.name}</span>
                <LogOut size={14} />
              </button>
            ) : (
              <button onClick={onSignIn} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
                Sign in
              </button>
            ))}
        </div>
      </div>
    </header>
  );
}
