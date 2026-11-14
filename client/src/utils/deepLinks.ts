import type { Participant } from "../types/receipt";

const CODES: Record<string, string> = {
  "$": "USD", USD: "USD", "₹": "INR", INR: "INR", RS: "INR", "RS.": "INR",
  "€": "EUR", EUR: "EUR", "£": "GBP", GBP: "GBP",
};

export const currencyCode = (symbol: string): string | null =>
  CODES[symbol.trim()] ?? CODES[symbol.trim().toUpperCase()] ?? null;

/** UPI payload for a payment TO the organizer. Returns "" when UPI does not apply. */
export function upiLink(organizer: Participant | undefined, amount: number, currency: string): string {
  const upi = organizer?.upi_id?.trim();
  if (!organizer || !upi || amount <= 0 || currencyCode(currency) !== "INR") return "";
  const pa = encodeURIComponent(upi).replace(/%40/g, "@");
  return `upi://pay?pa=${pa}&pn=${encodeURIComponent(organizer.name)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent("SplitSnap Settlement")}`;
}

/** PayPal.me link for a payment TO the organizer. Returns "" when no handle is set. */
export function paypalLink(organizer: Participant | undefined, amount: number, currency: string): string {
  let handle = organizer?.paypal_handle?.trim().replace(/\/+$/, "") ?? "";
  if (handle.includes("paypal.me/")) handle = handle.split("paypal.me/").pop()!.split("/")[0];
  handle = handle.replace(/^@/, "");
  if (!handle || amount <= 0) return "";
  return `https://paypal.me/${encodeURIComponent(handle)}/${amount.toFixed(2)}${currencyCode(currency) ?? ""}`;
}

/** WhatsApp text. upi:// links are not tappable in chat apps, so share the VPA instead. */
export function whatsappSummary(
  merchant: string,
  currency: string,
  total: number,
  lines: { name: string; amount: number }[],
  organizer?: Participant,
): string {
  const rows = lines.map((l) => `👤 ${l.name}: ${currency}${l.amount.toFixed(2)}`).join("\n");
  const pay: string[] = [];
  if (organizer?.upi_id) pay.push(`Pay ${organizer.name} via UPI: ${organizer.upi_id}`);
  if (organizer?.paypal_handle) pay.push(`Pay ${organizer.name} via PayPal: paypal.me/${organizer.paypal_handle.replace(/^@/, "")}`);
  return [`🧾 *SplitSnap Settlement for ${merchant}*`, `Total Bill: ${currency}${total.toFixed(2)}`, "--------------------------------", rows, "--------------------------------", ...pay].join("\n");
}
