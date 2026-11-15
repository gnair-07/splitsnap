import { useRef, useState } from "react";
import { Camera, Upload, X } from "lucide-react";
import CameraCapture from "./CameraCapture";

interface Props {
  status: "idle" | "scanning" | "error";
  error: string | null;
  canScan: boolean;
  onNeedSignIn: () => void;
  onPreset: (name: string) => void;
  onFile: (file: File) => void;
  onDismissError: () => void;
}

const PRESETS = [
  { key: "cafe", label: "☕ Blue Tokai Café (₹)" },
  { key: "dinner", label: "🍕 Italian Dinner ($)" },
  { key: "grocery", label: "🛒 Grocery Cart ($)" },
];

export default function ReceiptUploader({ status, error, canScan, onNeedSignIn, onPreset, onFile, onDismissError }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const nativeCameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const scanning = status === "scanning";

  const guard = (action: () => void) => {
    if (!canScan) {
      onNeedSignIn();
      return;
    }
    action();
  };

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) guard(() => onFile(f));
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-slate-900">1. Add your receipt</h2>

      {error && (
        <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <span className="flex-1">
            {error} <span className="text-red-700">You can also try a demo receipt below.</span>
          </span>
          <button onClick={onDismissError} aria-label="Dismiss" className="text-red-700">
            <X size={16} />
          </button>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed p-6 text-center ${dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300"}`}
      >
        {scanning ? (
          <div className="space-y-2" aria-live="polite">
            <div className="mx-auto h-4 w-2/3 animate-pulse rounded bg-slate-200" />
            <div className="mx-auto h-4 w-1/2 animate-pulse rounded bg-slate-200" />
            <div className="mx-auto h-4 w-3/5 animate-pulse rounded bg-slate-200" />
            <p className="pt-2 text-sm text-slate-600">Reading your receipt… this can take up to 20 seconds.</p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-600">Scan with your camera, or drop a receipt photo here</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={() => guard(() => setCameraOpen(true))}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <Camera size={16} /> Scan with camera
              </button>
              <button
                onClick={() => guard(() => fileRef.current?.click())}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                <Upload size={16} /> Upload photo
              </button>
            </div>
            {!canScan && <p className="mt-3 text-xs text-slate-500">Sign in to scan your own receipts. Demo receipts below work without signing in.</p>}
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        <input ref={nativeCameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Or try a demo receipt</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              disabled={scanning}
              onClick={() => onPreset(p.key)}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {cameraOpen && (
        <CameraCapture
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => {
            setCameraOpen(false);
            onFile(file);
          }}
          onFallback={() => {
            setCameraOpen(false);
            nativeCameraRef.current?.click();
          }}
        />
      )}
    </section>
  );
}
