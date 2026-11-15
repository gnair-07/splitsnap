import { useEffect, useRef, useState } from "react";
import { loginWithGoogle } from "../utils/api";
import type { User } from "../types/receipt";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Could not load Google Sign-In (is it blocked by an extension or network?)")));
  });
}

interface Props {
  clientId: string;
  onSignedIn: (user: User) => void;
  onGuest: () => void;
}

export default function SignInPage({ clientId, onSignedIn, onGuest }: Props) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (resp: { credential: string }) => {
            setBusy(true);
            setError(null);
            try {
              onSignedIn(await loginWithGoogle(resp.credential));
            } catch (e) {
              setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
              setBusy(false);
            }
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, { theme: "outline", size: "large", shape: "pill", text: "continue_with", width: 300 });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [clientId, onSignedIn]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="text-4xl">🧾</div>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">SplitSnap</h1>
        <p className="mt-1 text-sm text-slate-600">Snap the bill. Split it fairly. Settle in one tap.</p>

        <ul className="my-5 space-y-1 text-left text-sm text-slate-700">
          <li>📷 Scan receipts with your camera</li>
          <li>⚖️ Fair split of tax, tip and discounts, to the cent</li>
          <li>💸 UPI / PayPal QR and a WhatsApp summary</li>
        </ul>

        <div className="flex min-h-[44px] justify-center" ref={buttonRef} aria-busy={busy} />
        {busy && <p className="mt-2 text-sm text-slate-600">Signing you in…</p>}
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-5 border-t border-slate-200 pt-4">
          <button onClick={onGuest} className="text-sm text-indigo-700 underline">
            Continue as guest
          </button>
          <p className="mt-1 text-xs text-slate-500">Guests can use the demo receipts. Sign in to scan your own receipts.</p>
        </div>
      </div>
    </div>
  );
}
