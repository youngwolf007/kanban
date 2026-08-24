#!/usr/bin/env bash
# Stop and remove the app container. Mac and Linux.
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose down
echo "App stopped"
