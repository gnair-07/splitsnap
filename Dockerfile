# ---- Stage 1: build the React app ----
FROM node:20-alpine AS web
WORKDIR /client
COPY client/package.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ---- Stage 2: Flask API that also serves the built app ----
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY server/requirements.txt server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt
COPY server/ server/
COPY --from=web /client/dist client/dist
WORKDIR /app/server
# ONE worker + threads: the rate limiter keeps its counters in memory. 120 s timeout: vision calls can be slow.
CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 8 --timeout 120"]
