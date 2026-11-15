import logging
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # must run before modules that read environment variables

from flask import Flask, jsonify, request, send_from_directory, session
from flask_cors import CORS
from pydantic import ValidationError
from werkzeug.middleware.proxy_fix import ProxyFix

from auth import CLIENT_ID, auth_enabled, current_user, email_allowed, verify_google_credential
from mock_data import MOCK_RECEIPTS
from models import SplitCalculationRequest
from receipt_parser import ReceiptParseError, check_vision, parse_receipt_image, validate_receipt
from split_engine import calculate_reconciliation


_RATE_LIMIT_WINDOW = 60 * 60
_RATE_LIMIT_MAX_REQUESTS = 10
_rate_limit_requests = defaultdict(deque)
_rate_limit_lock = threading.Lock()


def check_and_record(key: str) -> str | None:
    """Allow at most 10 metered vision requests per key per hour."""
    now = time.monotonic()
    with _rate_limit_lock:
        requests = _rate_limit_requests[key]
        while requests and now - requests[0] >= _RATE_LIMIT_WINDOW:
            requests.popleft()
        if len(requests) >= _RATE_LIMIT_MAX_REQUESTS:
            return "Rate limit reached. Please try again later."
        requests.append(now)
    return None

DIST = (Path(__file__).resolve().parent.parent / "client" / "dist")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB uploads

# Trust 1 reverse proxy hop in production (e.g., Render) so request.remote_addr cannot be spoofed
if os.getenv("RENDER"):
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# Signed session cookie for "Sign in with Google". Set SECRET_KEY on the server (any long random string);
# without it a random key is generated at start-up and everyone is signed out whenever the server restarts.
if not os.getenv("SECRET_KEY"):
    logging.getLogger("splitsnap").warning("SECRET_KEY is not set; sessions will reset on every restart.")
app.secret_key = os.getenv("SECRET_KEY") or secrets.token_hex(32)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=bool(os.getenv("RENDER")),  # Render sets RENDER automatically and serves HTTPS
    PERMANENT_SESSION_LIFETIME=timedelta(days=14),
)

# Dev only: the Vite dev server on :5173. In production the API and the UI share one origin, so CORS is unused.
_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
CORS(app, resources={r"/api/*": {"origins": _origins}}, supports_credentials=True)


def client_ip() -> str:
    return request.remote_addr or "unknown"


@app.errorhandler(413)
def too_large(_e):
    return jsonify({"error": "Image is too large (max 10 MB)."}), 413


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "service": "SplitSnap API", "vision_enabled": bool(os.getenv("GEMINI_API_KEY"))}), 200


@app.route("/api/config", methods=["GET"])
def config():
    return jsonify({
        "auth_enabled": auth_enabled(),
        "google_client_id": CLIENT_ID if auth_enabled() else "",
        "vision_enabled": bool(os.getenv("GEMINI_API_KEY")),
    }), 200


@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    return jsonify({"user": current_user()}), 200


@app.route("/api/auth/google", methods=["POST"])
def auth_google():
    if not auth_enabled():
        return jsonify({"error": "Sign-in is not enabled on this server."}), 400
    payload = request.get_json(silent=True) or {}
    credential = payload.get("credential")
    if not isinstance(credential, str) or not credential:
        return jsonify({"error": "Missing Google credential."}), 400
    try:
        user = verify_google_credential(credential)
    except Exception:  # noqa: BLE001
        logging.getLogger("splitsnap").exception("Google token verification failed")
        return jsonify({"error": "Google sign-in could not be verified. Please try again."}), 401
    if not email_allowed(user["email"]):
        return jsonify({"error": "This Google account is not allowed to use this app."}), 403
    session.clear()
    session["user"] = user
    session.permanent = True
    return jsonify({"user": user}), 200


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    session.clear()
    return jsonify({"ok": True}), 200


@app.route("/api/vision-check", methods=["GET"])
def vision_check():
    """Diagnostic check to verify whether the Gemini key and model work."""
    user = current_user()
    if auth_enabled() and not user:
        return jsonify({"ok": False, "error": "Please sign in to run the vision check."}), 401
    if not os.getenv("GEMINI_API_KEY"):
        return jsonify({"ok": False, "error": "GEMINI_API_KEY is not set on the server."}), 200
    reason = check_and_record(f"user:{user['sub']}" if user else client_ip())
    if reason:
        return jsonify({"ok": False, "error": reason}), 429
    return jsonify(check_vision()), 200


@app.route("/api/samples", methods=["GET"])
def get_samples():
    return jsonify({k: v.model_dump() for k, v in MOCK_RECEIPTS.items()}), 200


@app.route("/api/scan-receipt", methods=["POST"])
def scan_receipt():
    # Free + offline: POST /api/scan-receipt?preset=cafe
    preset = request.args.get("preset")
    if preset:
        if preset not in MOCK_RECEIPTS:
            return jsonify({"error": f"Unknown preset '{preset}'"}), 404
        receipt = MOCK_RECEIPTS[preset]
        return jsonify({"receipt": receipt.model_dump(), "warnings": validate_receipt(receipt), "source": "preset"}), 200

    user = current_user()
    if auth_enabled() and not user:
        return jsonify({"error": "Please sign in to scan receipts.", "code": "auth_required"}), 401

    image_file = request.files.get("image")
    if not image_file or not image_file.filename:
        return jsonify({"error": "No image uploaded (multipart field 'image')."}), 400

    raw_bytes = image_file.read()
    if not raw_bytes:
        return jsonify({"error": "Uploaded image file is empty."}), 400

    if os.getenv("GEMINI_API_KEY"):  # only meter calls that cost money
        reason = check_and_record(f"user:{user['sub']}" if user else client_ip())
        if reason:
            return jsonify({"error": reason}), 429

    try:
        receipt, warnings = parse_receipt_image(raw_bytes)
    except ReceiptParseError as e:
        return jsonify({"error": str(e)}), e.status_code

    return jsonify({"receipt": receipt.model_dump(), "warnings": warnings, "source": "vision"}), 200


@app.route("/api/calculate-split", methods=["POST"])
def calculate_split():
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"error": "Request body must be JSON."}), 400
    try:
        req = SplitCalculationRequest.model_validate(payload)
        response = calculate_reconciliation(
            receipt=req.receipt,
            participants=req.participants,
            assignments=req.item_assignments,
            custom_shares=req.custom_shares,
            organizer_id=req.organizer_id,
        )
    except ValidationError as e:
        return jsonify({"error": "Invalid request", "details": e.errors(include_url=False, include_context=False, include_input=False)}), 422
    except ValueError as e:
        return jsonify({"error": str(e)}), 422
    return jsonify(response.model_dump()), 200


@app.route("/api/<path:_rest>")
def api_not_found(_rest):
    return jsonify({"error": "Not found"}), 404


# Production: serve the built React app (client/dist) from the same server.
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def spa(path):
    target = (DIST / path).resolve()
    if path and DIST in target.parents and target.is_file():
        return send_from_directory(DIST, path)
    if (DIST / "index.html").exists():
        return send_from_directory(DIST, "index.html", max_age=0)
    return jsonify({"error": "Frontend not built. Run `npm run build` in client/ (or use the Vite dev server on :5173)."}), 404


if __name__ == "__main__":
    # Local dev. Port 5001: macOS reserves 5000 for AirPlay Receiver. Debug is opt-in (Werkzeug debugger = RCE if exposed).
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5001")), debug=os.getenv("FLASK_DEBUG") == "1")