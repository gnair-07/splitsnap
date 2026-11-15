import io
import json
import logging
import os
import re
from typing import List, Tuple

from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import ValidationError

from models import ParsedReceipt
from split_engine import to_cents

try:  # optional: lets iPhone HEIC/HEIF photos work
    from pillow_heif import register_heif_opener

    register_heif_opener()
except Exception:  # noqa: BLE001
    pass

log = logging.getLogger("splitsnap.parser")

DEFAULT_MODEL = "gemini-3.8-flash"  # override with GEMINI_MODEL; models get retired, run check_gemini.py to list yours
MAX_SIDE = 2560  # long receipts need resolution; 1600 px made small print unreadable

VISION_SYSTEM_PROMPT = """
You are a precision OCR and receipt data extraction engine. Read the receipt photo carefully, digit by digit,
and extract every purchased line plus the tax, service charge, tip, discount and totals.
Return ONLY valid JSON strictly complying with this schema:
{
  "merchant": "string",
  "date": "YYYY-MM-DD or empty string",
  "currency": "$, ₹, €, £",
  "items": [
    { "id": "item_1", "name": "Exact item name", "price": 0.00, "quantity": 1 }
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "service_charge": 0.00,
  "tip": 0.00,
  "discount": 0.00,
  "grand_total": 0.00
}
Rules:
1. Every individual purchased line must have a distinct 'id' (item_1, item_2...).
2. 'price' is the TOTAL cost of that line (quantity x unit price), not the unit price.
3. An item name can wrap over two lines; join them into one item. Ignore lines that are not purchases
   (payment method, cash tendered, change, card number, UPI/transaction ids, loyalty points, "Total Qty", table or bill numbers).
4. Do NOT include taxes, service charges or tips inside the items; isolate them in their own keys.
5. If tax is split into several lines (CGST + SGST, state + city tax), 'tax' is their sum.
6. 'discount' is a positive number for anything subtracted from the bill. A "round off" line is not a discount.
7. 'grand_total' is the final amount payable. All numbers are plain JSON numbers: no currency symbols, no thousands separators.
8. Use 0 for any amount not on the receipt. Never use null for numbers.
9. subtotal + tax + service_charge + tip - discount must approximately equal grand_total. If it does not, re-read the numbers.
"""

RETRY_TEMPLATE = """Your previous extraction has inconsistencies:
{problems}

Previous JSON:
{previous}

Re-read the receipt image very carefully (digit by digit, including items that wrap over two lines or have quantities)
and return the corrected JSON in exactly the same schema."""


class ReceiptParseError(Exception):
    def __init__(self, message: str, status_code: int = 422):
        super().__init__(message)
        self.status_code = status_code


def _sanitize(text: str) -> str:
    """Make an exception message safe to show: strip secrets, collapse whitespace, cap length."""
    text = re.sub(r"AIza[0-9A-Za-z_\-]{20,}", "[redacted-key]", text or "")
    key = os.getenv("GEMINI_API_KEY")
    if key:
        text = text.replace(key, "[redacted-key]")
    return " ".join(text.split())[:300]


def _status_of(e: Exception):
    status = getattr(e, "code", None) or getattr(e, "status_code", None)
    return status if isinstance(status, int) else None


def explain_vision_error(e: Exception, model: str) -> str:
    """Turn a Gemini failure into an actionable message (never includes the API key)."""
    status = _status_of(e)
    raw = str(e)
    low = raw.lower()
    if isinstance(e, ImportError):
        hint = "The server is missing the google-genai package."
    elif "api key" in low or "api_key_invalid" in low or status == 401:
        hint = "The Gemini API key was rejected. Create a new key at aistudio.google.com/apikey and set GEMINI_API_KEY on the server (no quotes or spaces)."
    elif status == 403 or "permission" in low:
        hint = "The key is not allowed to use the Gemini API (permission denied). Create a new key in Google AI Studio."
    elif status == 404 or "not found" in low:
        hint = f"The model '{model}' was not found or has been retired. Set GEMINI_MODEL on the server to a current model."
    elif status == 429 or "quota" in low or "resource_exhausted" in low:
        hint = "Gemini quota exceeded. Wait a while, or enable billing for the key."
    elif status is not None and status >= 500:
        hint = "Google's service is busy or down. Try again shortly."
    else:
        hint = "Unexpected error while calling Gemini."
    return f"{hint} [{type(e).__name__}{' ' + str(status) if status else ''}: {_sanitize(raw)}]"


def check_vision() -> dict:
    """Tiny text-only call used by /api/vision-check to diagnose key / model problems."""
    model = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
    try:
        from google import genai

        client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        reply = client.models.generate_content(model=model, contents="Reply with the single word: ok")
        return {"ok": True, "model": model, "reply": (reply.text or "")[:40]}
    except Exception as e:  # noqa: BLE001 - diagnostic endpoint reports everything
        log.exception("Vision check failed")
        result = {"ok": False, "model": model, "error": explain_vision_error(e, model)}
        try:  # help pick a working model: list flash models this key can use
            names = [m.name.replace("models/", "") for m in genai.Client(api_key=os.getenv("GEMINI_API_KEY")).models.list()]
            result["available_flash_models"] = [n for n in names if "flash" in n][:15]
        except Exception:  # noqa: BLE001
            pass
        return result


def _prepare_image(image_bytes: bytes) -> bytes:
    """Validate, fix phone-camera rotation (EXIF), downscale and re-encode as high-quality JPEG."""
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise ReceiptParseError("The uploaded file is not a valid image (use PNG, JPEG or HEIC).", 400)
    img = ImageOps.exif_transpose(img).convert("RGB")
    if min(img.size) < 200:
        raise ReceiptParseError("The image is too small to read. Use a photo of at least 200 px on each side.", 400)
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=90)
    return out.getvalue()


def _extract_json(text: str) -> dict:
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE)
    data = json.loads(text)
    if isinstance(data, list) and data:
        data = data[0]
    if not isinstance(data, dict):
        raise ValueError("Model did not return a JSON object")
    return data


def _to_receipt(raw_text: str) -> ParsedReceipt:
    try:
        return ParsedReceipt.model_validate(_extract_json(raw_text))
    except (ValueError, ValidationError):  # JSONDecodeError is a ValueError
        log.exception("Vision output was not a valid receipt")
        raise ReceiptParseError("Could not read this receipt. Try a clearer, well-lit photo with the whole receipt in frame.", 422)


def inconsistency_cents(receipt: ParsedReceipt) -> int:
    """How far the receipt is from adding up (0 = perfectly consistent)."""
    items_sum = sum(to_cents(i.price) for i in receipt.items)
    computed = (
        items_sum + to_cents(receipt.tax) + to_cents(receipt.service_charge)
        + to_cents(receipt.tip) - to_cents(receipt.discount)
    )
    return abs(items_sum - to_cents(receipt.subtotal)) + abs(computed - to_cents(receipt.grand_total))


def validate_receipt(receipt: ParsedReceipt) -> List[str]:
    """Return human-readable warnings about internal inconsistencies (never silently 'fixes' data)."""
    warnings: List[str] = []
    items_sum = sum(to_cents(i.price) for i in receipt.items)
    if abs(items_sum - to_cents(receipt.subtotal)) > 2:
        warnings.append(
            f"Line items add up to {items_sum / 100:.2f} but the receipt subtotal is {receipt.subtotal:.2f}. Check for missing items."
        )
    computed = (
        items_sum + to_cents(receipt.tax) + to_cents(receipt.service_charge)
        + to_cents(receipt.tip) - to_cents(receipt.discount)
    )
    if abs(computed - to_cents(receipt.grand_total)) > 2:
        warnings.append(
            f"Items + tax + fees - discount = {computed / 100:.2f} but the receipt total is {receipt.grand_total:.2f}. "
            "The difference will be spread proportionally."
        )
    return warnings


def parse_receipt_image(image_bytes: bytes) -> Tuple[ParsedReceipt, List[str]]:
    """Run the vision model. Raises ReceiptParseError on any failure (never returns fake data).

    If the first read does not add up, the model gets ONE second look with the discrepancy spelled out;
    the better of the two reads is kept.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ReceiptParseError(
            "No GEMINI_API_KEY configured on the server. Add it to server/.env or use a demo preset.", 503
        )
    jpeg = _prepare_image(image_bytes)
    model = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        def call(instruction: str) -> str:
            response = client.models.generate_content(
                model=model,
                contents=[types.Part.from_bytes(data=jpeg, mime_type="image/jpeg"), instruction],
                config=types.GenerateContentConfig(
                    system_instruction=VISION_SYSTEM_PROMPT,
                    response_mime_type="application/json",
                ),
            )
            return response.text

        raw_text = call("Extract the receipt data as JSON.")
    except Exception as e:  # noqa: BLE001
        log.exception("Vision API call failed")
        status = _status_of(e)
        raise ReceiptParseError(explain_vision_error(e, model), 429 if status == 429 else 502)

    receipt = _to_receipt(raw_text)
    if not receipt.items:
        raise ReceiptParseError("No line items were found on this receipt.", 422)
    warnings = validate_receipt(receipt)

    if warnings:  # second look, keep whichever read is more self-consistent
        try:
            retry_raw = call(
                RETRY_TEMPLATE.format(
                    problems="\n".join(warnings),
                    previous=json.dumps(receipt.model_dump(), ensure_ascii=False),
                )
            )
            retry = _to_receipt(retry_raw)
            if retry.items and inconsistency_cents(retry) < inconsistency_cents(receipt):
                receipt, warnings = retry, validate_receipt(retry)
        except Exception:  # noqa: BLE001 - the first read is still usable
            log.exception("Second-look read failed; keeping the first read")

    # Never trust model-generated ids: guarantee unique, stable ids.
    for n, item in enumerate(receipt.items, start=1):
        item.id = f"item_{n}"

    return receipt, warnings
