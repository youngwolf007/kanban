#!/usr/bin/env bash
# Build and start the app. Mac and Linux.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env in the project root. It must contain OPENROUTER_API_KEY." >&2
  exit 1
fi

docker compose up --build -d
echo "App running at http://localhost:8000"
