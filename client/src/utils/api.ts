import type { AppConfig, ScanResponse, SplitCalculationRequest, SplitCalculationResponse, User } from "../types/receipt";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status, data?.code);
  return data as T;
}

export const getConfig = async (): Promise<AppConfig> => handle<AppConfig>(await fetch("/api/config"));

export async function getMe(): Promise<User | null> {
  const data = await handle<{ user: User | null }>(await fetch("/api/auth/me"));
  return data.user;
}

export async function loginWithGoogle(credential: string): Promise<User> {
  const res = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  return (await handle<{ user: User }>(res)).user;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}

export async function scanPreset(name: string): Promise<ScanResponse> {
  return handle<ScanResponse>(await fetch(`/api/scan-receipt?preset=${encodeURIComponent(name)}`, { method: "POST" }));
}

/** Downscale big phone photos in the browser (faster upload, fixes EXIF rotation). Long receipts keep up to 2560 px. */
export async function shrinkImage(file: File, maxSide = 2560): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.type === "image/jpeg" && file.size < 4_000_000) {
      bmp.close();
      return file; // already small enough: do not re-compress text
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    return blob ?? file;
  } catch {
    return file; // e.g. HEIC in Chrome: the server can decode it
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
