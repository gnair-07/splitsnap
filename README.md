# 🧾 SplitSnap

Snap a receipt, assign items to friends, and split the bill fairly: tax, service charge, tip and discounts are shared in proportion to what each person ordered, exact to the cent. Settle with a UPI/PayPal QR code or a WhatsApp message.

- **Frontend:** React 18 + TypeScript + Vite + Tailwind (`client/`)
- **Backend:** Flask + Pydantic, Gemini vision for receipt scanning (`server/`)
- **Production:** one Docker container; Flask serves the API *and* the built frontend

---

## 1. Run it locally

You need Python 3.11+ and Node 20+.

```bash
# Terminal 1: backend
cd server
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                 # then paste your GEMINI_API_KEY (optional, see below)
python test_split_engine.py          # every line should say PASS
python app.py                        # http://127.0.0.1:5001

# Terminal 2: frontend
cd client
npm install
npm run dev                          # http://localhost:5173
```

Get a free Gemini key at https://aistudio.google.com/apikey. Without a key the demo receipts still work; only photo scanning is disabled (the app tells the user).

Quick backend check:

```bash
curl -s localhost:5001/api/health
curl -s -X POST "localhost:5001/api/scan-receipt?preset=dinner" | head -c 200
```

## 2. Deploy it (public URL, about 10 minutes)

### Option A: Render (easiest)

1. Create a GitHub repo and push this folder:
   ```bash
   git init && git add . && git commit -m "SplitSnap"
   git branch -M main
   git remote add origin https://github.com/<you>/splitsnap.git
   git push -u origin main
   ```
   Check that `server/.env` is **not** in the repo (`.gitignore` already excludes it).
2. Go to https://render.com, sign up, click **New +, then Web Service**, and connect your repo.
3. Settings:
   - **Language/Runtime:** Docker (Render finds the `Dockerfile` in the repo root)
   - **Instance type:** Free is fine for a demo
   - **Environment variables:** add `GEMINI_API_KEY` = your key (optional: `SCAN_LIMIT_PER_HOUR=15`, `SCAN_DAILY_CAP=300`)
4. Click **Create Web Service**. After the build finishes you get a URL like `https://splitsnap-xxxx.onrender.com`. That is your public app.

Notes: the free tier sleeps after ~15 minutes idle, so the first visit afterwards takes 30 to 60 seconds. Paid instances don't sleep.

### Option B: Any other container host

The same `Dockerfile` works on Railway, Fly.io and Google Cloud Run. Requirements: expose the container's `$PORT` (the image reads it, defaulting to 8080), and set `GEMINI_API_KEY` as a secret environment variable.

```bash
docker build -t splitsnap .
docker run -p 8080:8080 -e GEMINI_API_KEY=your_key splitsnap     # http://localhost:8080
```

### Option C: Frontend and backend on separate hosts

Not recommended (extra CORS and URL setup). If you must: host `client/dist` on Vercel/Netlify, change the `fetch("/api/...")` calls in `client/src/utils/api.ts` to use your backend URL, and set `CORS_ORIGINS=https://your-frontend-domain` on the backend.

## 3. Protect your API key and wallet

- The key lives only on the server, never in the browser.
- Scans are rate limited per visitor (`SCAN_LIMIT_PER_HOUR`) and globally per day (`SCAN_DAILY_CAP`). When the daily cap is reached the app tells users to use a demo receipt. The limiter is in memory and resets when the server restarts or sleeps.
- In Google AI Studio / Google Cloud, also set a **quota or budget alert** on the key. This is your real safety net.
- Demo presets and the split calculation cost nothing and are never limited.

## 4. Project layout

```
client/   React app (components/, utils/mathEngine.ts, utils/deepLinks.ts, utils/api.ts)
server/   app.py (routes), split_engine.py (exact-cent math), receipt_parser.py (Gemini),
          ratelimit.py, mock_data.py, test_split_engine.py
Dockerfile  .dockerignore  .gitignore
```

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| "No GEMINI_API_KEY configured" in the app | Set the env var on the server and redeploy/restart. |
| "The vision service failed" | Wrong key, no quota, or a retired model name. Check `GEMINI_MODEL` against Google's current model list. |
| "Could not read this receipt" | Retake the photo: flat, well lit, whole receipt in frame. |
| Blank page after deploy | Check the build log for `npm run build` errors (TypeScript errors fail the build). |
| `Frontend not built` JSON in dev on :5001 | Use http://localhost:5173 in dev; the built app only exists after `npm run build`. |
| Works locally, 502 on host | The container must listen on `$PORT`; don't hard-code another port. |
| macOS: port 5000 busy | Already handled: the backend uses 5001. |

## 6. How the split works

All money is integer cents. Each item is split among its sharers (equally or by weight) with the largest-remainder method. Tax, service charge + tip, discount, and any receipt round-off are then shared in proportion to each person's item total. Anything unassigned is reported separately and never charged to anyone. When everything is assigned, the amounts add up to the receipt total exactly. The server and the browser use the same algorithm, and the browser's numbers are verified against the server's.
