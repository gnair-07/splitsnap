import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # must run before modules that read environment variables

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from pydantic import ValidationError

from mock_data import MOCK_RECEIPTS
from models import SplitCalculationRequest
from ratelimit import check_and_record
from receipt_parser import ReceiptParseError, parse_receipt_image, validate_receipt
from split_engine import calculate_reconciliation

DIST = (Path(__file__).resolve().parent.parent / "client" / "dist")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10 MB uploads

# Dev only: the Vite dev server on :5173. In production the API and the UI share one origin, so CORS is unused.
_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]
CORS(app, resources={r"/api/*": {"origins": _origins}})


def client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    return forwarded.split(",")[0].strip() or request.remote_addr or "unknown"


@app.errorhandler(413)
def too_large(_e):
    return jsonify({"error": "Image is too large (max 10 MB)."}), 413


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "service": "SplitSnap API", "vision_enabled": bool(os.getenv("GEMINI_API_KEY"))}), 200


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

    image_file = request.files.get("image")
    if image_file is None:
        return jsonify({"error": "No image uploaded (multipart field 'image')."}), 400
    if os.getenv("GEMINI_API_KEY"):  # only meter calls that cost money
        reason = check_and_record(client_ip())
        if reason:
            return jsonify({"error": reason}), 429
    try:
        receipt, warnings = parse_receipt_image(image_file.read())
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
        return send_from_directory(DIST, "index.html")
    return jsonify({"error": "Frontend not built. Run `npm run build` in client/ (or use the Vite dev server on :5173)."}), 404


if __name__ == "__main__":
    # Local dev. Port 5001: macOS reserves 5000 for AirPlay Receiver. Debug is opt-in (Werkzeug debugger = RCE if exposed).
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "5001")), debug=os.getenv("FLASK_DEBUG") == "1")
