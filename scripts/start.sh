#!/usr/bin/env bash
# Build and start the app. Mac and Linux.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env in the project root. It must contain OPENROUTER_API_KEY." >&2
  exit 1
fi

# Without this the container signs session cookies with the fallback key in
# backend/app/main.py, which is published in the source, so anyone who has read the
# repository could forge a session. Written once and kept, so restarting does not
# sign everybody out. compose passes it through env_file.
if ! grep -q '^SECRET_KEY=' .env; then
  key=$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')
  printf '\nSECRET_KEY=%s\n' "$key" >> .env
  echo "Generated a SECRET_KEY in .env"
fi

docker compose up --build -d
echo "App running at http://localhost:8000"
