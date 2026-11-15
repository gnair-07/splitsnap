import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X, Zap } from "lucide-react";

interface Props {
  onCapture: (file: File) => void;
  onClose: () => void;
  onFallback: () => void; // open the phone's native camera app instead
}

function explain(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera permission is blocked. Tap the lock icon next to the address, set Camera to Allow, then press Try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device.";
  if (name === "NotReadableError" || name === "AbortError") return "The camera is busy. Close other apps that use it (video calls, other tabs), then press Try again.";
  return "Could not start the camera.";
}

export default function CameraCapture({ onCapture, onClose, onFallback }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchOk, setTorchOk] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [shot, setShot] = useState<{ url: string; file: File } | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);
    setTorchOk(false);
    setTorchOn(false);
    stopStream();

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser cannot open the camera here. Camera scanning needs a secure (https) page and a modern browser.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        const caps = (stream.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as unknown as { torch?: boolean };
        setTorchOk(!!caps.torch);
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(explain(e));
      }
    }
    start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [facing, attempt, stopStream]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !ready || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setError("Could not capture the photo. Please try again.");
      return;
    }
    setShot({ url: URL.createObjectURL(blob), file: new File([blob], "receipt.jpg", { type: "image/jpeg" }) });
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] } as unknown as MediaTrackConstraints);
      setTorchOn(!torchOn);
    } catch {
      setTorchOk(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Scan receipt with camera">
      <div className="flex items-center justify-between p-3 text-white">
        <p className="text-sm">{shot ? "Check that the text is sharp" : "Lay the receipt flat and fill the frame"}</p>
        <button onClick={onClose} aria-label="Close camera" className="rounded-full p-2 hover:bg-white/10">
          <X size={22} />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className={`h-full w-full object-contain ${shot ? "hidden" : ""}`} />
        {shot && <img src={shot.url} alt="Captured receipt" className="h-full w-full object-contain" />}
        {!shot && ready && <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-dashed border-white/60" />}
        {!ready && !error && !shot && <p className="absolute inset-0 flex items-center justify-center text-white">Starting camera… allow access if asked.</p>}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            <p className="max-w-sm text-sm">{error}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={() => setAttempt((n) => n + 1)} className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900">
                Try again
              </button>
              <button onClick={onFallback} className="rounded-lg border border-white/50 px-4 py-2 text-sm">
                Use phone camera app
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 p-5">
        {shot ? (
          <>
            <button onClick={() => setShot(null)} className="rounded-lg border border-white/50 px-5 py-2.5 text-white">
              Retake
            </button>
            <button onClick={() => onCapture(shot.file)} className="rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-white">
              Use this photo
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} aria-label="Switch camera" className="rounded-full p-3 text-white hover:bg-white/10">
              <RefreshCw size={22} />
            </button>
            <button onClick={capture} disabled={!ready} aria-label="Take photo" className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 text-white disabled:opacity-40">
              <Camera size={26} />
            </button>
            <button onClick={toggleTorch} disabled={!torchOk} aria-label="Toggle flashlight" className={`rounded-full p-3 hover:bg-white/10 disabled:opacity-30 ${torchOn ? "bg-yellow-400 text-black" : "text-white"}`}>
              <Zap size={22} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
