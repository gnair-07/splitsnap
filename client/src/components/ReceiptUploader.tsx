import { useRef, useState } from "react";
import { Camera, Upload, X } from "lucide-react";

interface Props {
  status: "idle" | "scanning" | "error";
  error: string | null;
  onPreset: (name: string) => void;
  onFile: (file: File) => void;
  onDismissError: () => void;
}

const PRESETS = [
  { key: "cafe", label: "☕ Blue Tokai Café (₹)" },
  { key: "dinner", label: "🍕 Italian Dinner ($)" },
  { key: "grocery", label: "🛒 Grocery Cart ($)" },
];

export default function ReceiptUploader({ status, error, onPreset, onFile, onDismissError }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const scanning = status === "scanning";

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
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
            <p className="pt-2 text-sm text-slate-600">Reading your receipt…</p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-600">Drag a receipt photo here, or choose one</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <Upload size={16} /> Upload photo
              </button>
              <button
                onClick={() => cameraRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                <Camera size={16} /> Take photo
              </button>
            </div>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
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
    </section>
  );
}
