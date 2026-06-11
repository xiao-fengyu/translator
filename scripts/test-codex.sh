#!/usr/bin/env bash
set -euo pipefail

URL="${TRANSLATOR_HEALTH_URL:-http://127.0.0.1:3000/healthz}"
BASE_URL="${URL%/healthz}"

curl -sS "$URL"
printf '\n'
curl -sS "$BASE_URL/v1/models" | head -c 500
printf '\n'
