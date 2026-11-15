import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "./components/Navbar";
import ReceiptUploader from "./components/ReceiptUploader";
import MemberManager from "./components/MemberManager";
import ItemAssignmentGrid from "./components/ItemAssignmentGrid";
import ReconciliationPanel from "./components/ReconciliationPanel";
import SettlementModal from "./components/SettlementModal";
import SignInPage from "./components/SignInPage";
import type { AppConfig, ParsedReceipt, Participant, ScanResponse, SplitCalculationResponse, User } from "./types/receipt";
import { computeSplit } from "./utils/mathEngine";
import { ApiError, getConfig, getMe, logout, scanImage, scanPreset, verifySplit } from "./utils/api";
import { AVATAR_COLORS } from "./utils/format";

const DEFAULT_MEMBERS: Participant[] = [
  { id: "p1", name: "Alex", avatar_color: AVATAR_COLORS[0] },
  { id: "p2", name: "Sarah", avatar_color: AVATAR_COLORS[1] },
  { id: "p3", name: "David", avatar_color: AVATAR_COLORS[2] },
];

const GUEST_KEY = "splitsnap_guest";
const readGuest = (): boolean => {
  try {
    return localStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
};
const writeGuest = (on: boolean) => {
  try {
    if (on) localStorage.setItem(GUEST_KEY, "1");
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    /* storage unavailable: guest choice just won't persist */
  }
};

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [guest, setGuest] = useState<boolean>(readGuest());

  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "error">("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>(DEFAULT_MEMBERS);
  const [organizerId, setOrganizerId] = useState<string | null>("p1");
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [customShares, setCustomShares] = useState<Record<string, Record<string, number>>>({});
  const [verified, setVerified] = useState<SplitCalculationResponse | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const nextId = useRef(4);

  // Boot: ask the server whether sign-in is enabled and who (if anyone) is signed in.
  const boot = useCallback(async () => {
    setBootError(null);
    try {
      const cfg = await getConfig();
      setConfig(cfg);
      if (cfg.auth_enabled) setUser(await getMe());
    } catch {
      setBootError("Could not reach the server. If it was idle, wait about a minute and try again.");
    }
  }, []);
  useEffect(() => {
    boot();
  }, [boot]);

  const authEnabled = config?.auth_enabled ?? false;
  const canScan = !authEnabled || user !== null;

  const local = useMemo(
    () => (receipt ? computeSplit(receipt, participants, assignments, customShares, organizerId) : null),
    [receipt, participants, assignments, customShares, organizerId],
  );

  // Verify against the backend (debounced). Stale server data is never shown: reset on every change.
  useEffect(() => {
    setVerified(null);
    if (!receipt) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      verifySplit(
        { receipt, participants, item_assignments: assignments, custom_shares: customShares, organizer_id: organizerId },
        ctrl.signal,
      )
        .then(setVerified)
        .catch(() => {
          /* offline or aborted: the local engine keeps working */
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [receipt, participants, assignments, customShares, organizerId]);

  const loadScan = useCallback((res: ScanResponse) => {
    setReceipt(res.receipt);
    setWarnings(res.warnings);
    setAssignments({});
    setCustomShares({});
    setScanStatus("idle");
    setScanError(null);
  }, []);

  const run = useCallback(
    async (job: () => Promise<ScanResponse>) => {
      setScanStatus("scanning");
      setScanError(null);
      try {
        loadScan(await job());
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          // session expired or never signed in: send the user to the sign-in page
          setUser(null);
          setGuest(false);
          writeGuest(false);
          setScanStatus("idle");
          return;
        }
        setScanStatus("error");
        setScanError(e instanceof Error ? e.message : "Something went wrong.");
      }
    },
    [loadScan],
  );

  const goToSignIn = () => {
    writeGuest(false);
    setGuest(false);
  };
  const continueAsGuest = () => {
    writeGuest(true);
    setGuest(true);
  };
  const handleSignedIn = useCallback((u: User) => {
    setUser(u);
    setGuest(false);
    writeGuest(false);
  }, []);
  const signOut = async () => {
    await logout();
    setUser(null);
    reset();
  };

  const addParticipant = (name: string) => {
    const n = nextId.current++;
    setParticipants((prev) => [...prev, { id: `p${n}`, name, avatar_color: AVATAR_COLORS[(n - 1) % AVATAR_COLORS.length] }]);
  };

  const removeParticipant = (id: string) => {
    const remaining = participants.filter((p) => p.id !== id);
    if (remaining.length === 0) return;
    setParticipants(remaining);
    setOrganizerId((cur) => (cur === id ? remaining[0].id : cur));
    setAssignments((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v.filter((x) => x !== id)])));
    setCustomShares((prev) =>
      Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([pid]) => pid !== id))])),
    );
  };

  const toggle = (itemId: string, pid: string) =>
    setAssignments((prev) => {
      const cur = prev[itemId] ?? [];
      return { ...prev, [itemId]: cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid] };
    });

  const assignAll = (itemId: string) => setAssignments((prev) => ({ ...prev, [itemId]: participants.map((p) => p.id) }));

  const enableCustom = (itemId: string) => {
    const base = (assignments[itemId] ?? []).length > 0 ? assignments[itemId] : participants.map((p) => p.id);
    setCustomShares((prev) => ({ ...prev, [itemId]: Object.fromEntries(base.map((id) => [id, 1])) }));
  };

  const changeCustom = (itemId: string, pid: string, weight: number) =>
    setCustomShares((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] ?? {}), [pid]: Math.max(0, Math.min(9, weight)) } }));

  const disableCustom = (itemId: string) =>
    setCustomShares((prev) => {
      const { [itemId]: _removed, ...rest } = prev;
      return rest;
    });

  const reset = () => {
    setReceipt(null);
    setWarnings([]);
    setAssignments({});
    setCustomShares({});
    setScanStatus("idle");
    setScanError(null);
    setSettleOpen(false);
  };

  const result = verified ?? local;

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-center text-slate-700">
        {bootError ? (
          <div>
            <p className="mb-3">{bootError}</p>
            <button onClick={boot} className="rounded-lg bg-indigo-600 px-4 py-2 text-white">
              Try again
            </button>
          </div>
        ) : (
          <p>Loading…</p>
        )}
      </div>
    );
  }

  if (authEnabled && !user && !guest) {
    return <SignInPage clientId={config.google_client_id} onSignedIn={handleSignedIn} onGuest={continueAsGuest} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar onReset={reset} hasReceipt={receipt !== null} user={user} authEnabled={authEnabled} onSignIn={goToSignIn} onSignOut={signOut} />
      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <ReceiptUploader
            status={scanStatus}
            error={scanError}
            canScan={canScan}
            onNeedSignIn={goToSignIn}
            onPreset={(name) => run(() => scanPreset(name))}
            onFile={(file) => run(() => scanImage(file))}
            onDismissError={() => {
              setScanError(null);
              setScanStatus("idle");
            }}
          />
          <MemberManager
            participants={participants}
            organizerId={organizerId}
            onAdd={addParticipant}
            onRemove={removeParticipant}
            onSetOrganizer={setOrganizerId}
            onUpdate={(id, patch) => setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))}
          />
        </div>

        {warnings.length > 0 && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <b>Please double-check the scan against your receipt:</b>
            <ul className="ml-5 list-disc">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {receipt && local && result && (
          <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
            <ItemAssignmentGrid
              receipt={receipt}
              participants={participants}
              assignments={assignments}
              customShares={customShares}
              onToggle={toggle}
              onAll={assignAll}
              onCustomEnable={enableCustom}
              onCustomChange={changeCustom}
              onCustomDisable={disableCustom}
            />
            <ReconciliationPanel receipt={receipt} participants={participants} local={local} verified={verified} onSettle={() => setSettleOpen(true)} />
          </div>
        )}

        {receipt && result && (
          <SettlementModal
            open={settleOpen}
            onClose={() => setSettleOpen(false)}
            receipt={receipt}
            participants={participants}
            organizerId={organizerId}
            result={result}
          />
        )}
      </main>
    </div>
  );
}
