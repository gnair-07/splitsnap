import type { ScanResponse, SplitCalculationRequest, SplitCalculationResponse } from "../types/receipt";

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data as T;
}

export async function scanPreset(name: string): Promise<ScanResponse> {
  return handle<ScanResponse>(await fetch(`/api/scan-receipt?preset=${encodeURIComponent(name)}`, { method: "POST" }));
}

/** Downscale phone photos in the browser (faster upload, fixes EXIF rotation, works for HEIC on Safari). */
export async function shrinkImage(file: File, maxSide = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function scanImage(file: File): Promise<ScanResponse> {
  const body = new FormData();
  body.append("image", await shrinkImage(file), "receipt.jpg");
  return handle<ScanResponse>(await fetch("/api/scan-receipt", { method: "POST", body }));
}

export async function verifySplit(req: SplitCalculationRequest, signal?: AbortSignal): Promise<SplitCalculationResponse> {
  return handle<SplitCalculationResponse>(
    await fetch("/api/calculate-split", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    }),
  );
}
