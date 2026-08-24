FROM node:22-bookworm-slim AS frontend

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# next/font/google downloads the fonts at build time, so this stage needs network.
RUN npm run build


FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    STATIC_DIR=/app/static \
    DB_PATH=/data/pm.db

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev

COPY backend/app ./app
COPY --from=frontend /frontend/out ./static

EXPOSE 8000

CMD ["uv", "run", "--no-dev", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
