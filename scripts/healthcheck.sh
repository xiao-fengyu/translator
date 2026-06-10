#!/usr/bin/env bash
set -euo pipefail

URL="${TRANSLATOR_HEALTH_URL:-http://127.0.0.1:3002/healthz}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

HTTP_CODE="$(curl -sS -m 5 -o "$TMP" -w '%{http_code}' "$URL")"
if [ "$HTTP_CODE" != "200" ]; then
  echo "translator unhealthy: HTTP $HTTP_CODE from $URL" >&2
  cat "$TMP" >&2 || true
  exit 1
fi

python3 - "$TMP" <<'PY'
import json, sys
path = sys.argv[1]
try:
    data = json.load(open(path, encoding='utf-8'))
except Exception as exc:
    print(f'translator unhealthy: invalid JSON: {exc}', file=sys.stderr)
    sys.exit(1)
if data.get('ok') is not True:
    print(f'translator unhealthy: ok field is {data.get("ok")!r}', file=sys.stderr)
    sys.exit(1)
print(f"translator healthy: {data.get('service', 'unknown')} {data.get('version', '')}".strip())
PY
