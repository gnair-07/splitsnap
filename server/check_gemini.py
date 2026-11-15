"""Diagnose Gemini problems in ~10 seconds. Run from the server/ folder:  python check_gemini.py"""
import os
import sys

from dotenv import load_dotenv

load_dotenv()
key = os.getenv("GEMINI_API_KEY", "")
print("=== SplitSnap Gemini check ===")
print(f"Key present: {bool(key.strip())} | length: {len(key)} | starts with 'AIza': {key.strip().startswith('AIza')}")
if key != key.strip() or any(c in key for c in " \"'"):
    print("PROBLEM: the key contains a space or quote character. In server/.env write exactly GEMINI_API_KEY=yourkey")
if not key.strip():
    sys.exit("PROBLEM: GEMINI_API_KEY is empty. Open server/.env, put your key after the = sign, save, run again.")
key = key.strip().strip("\"'")

try:
    import google.genai as g
    from google import genai
    print("google-genai version:", getattr(g, "__version__", "unknown"))
except Exception as e:
    sys.exit(f"PROBLEM: google-genai is not installed ({e}). Run: pip install -r requirements.txt")

client = genai.Client(api_key=key)

print("\n1) Asking Google which models this key can use...")
usable = []
try:
    for m in client.models.list():
        actions = getattr(m, "supported_actions", None) or []
        if "generateContent" in actions or not actions:
            usable.append(m.name.replace("models/", ""))
    flash = [n for n in usable if "flash" in n and not any(x in n for x in ("image", "tts", "live", "audio", "embedding"))]
    print(f"   Key works for listing. {len(usable)} models can generate content.")
    print("   Flash models available to you:", ", ".join(flash[:15]) or "(none found)")
except Exception as e:
    print(f"   FAILED: {type(e).__name__} {getattr(e, 'code', '')}: {str(e)[:300].replace(key, '[key]')}")
    print("   => The key itself is rejected or not allowed. Create a NEW key at https://aistudio.google.com/apikey")
    sys.exit(1)

model = os.getenv("GEMINI_MODEL") or (flash[0] if flash else (usable[0] if usable else "gemini-3.8-flash"))
print(f"\n2) Testing a real call with model '{model}'...")
try:
    r = client.models.generate_content(model=model, contents="Reply with the single word: ok")
    print("   SUCCESS. Model replied:", (r.text or "").strip()[:40])
    print(f"\n==> Set GEMINI_MODEL={model} in server/.env (and on Render), then restart the backend.")
except Exception as e:
    print(f"   FAILED: {type(e).__name__} {getattr(e, 'code', '')}: {str(e)[:300].replace(key, '[key]')}")
    print("   Send me this whole output.")
