#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env"
  set +a
fi

PORT="${TRANSLATOR_PORT:-3000}"
URL="${TRANSLATOR_HEALTH_URL:-http://127.0.0.1:$PORT/healthz}"
RESPONSES_URL="${TRANSLATOR_RESPONSES_URL:-http://127.0.0.1:$PORT/v1/responses}"
MODEL="${TRANSLATOR_HEALTH_MODEL:-${DEFAULT_MODEL:-gpt-5.5}}"
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

if [ "${TRANSLATOR_DEEP_CHECK:-0}" != "1" ]; then
  exit 0
fi

cat > "$TMP" <<JSON
{"model":"$MODEL","input":"Reply exactly: pong","stream":false}
JSON

BODY_FILE="$(mktemp)"
trap 'rm -f "$TMP" "$BODY_FILE"' EXIT
HTTP_CODE="$(curl -sS -m 30 -o "$BODY_FILE" -w '%{http_code}' \
  -H 'content-type: application/json' \
  -d "@$TMP" \
  "$RESPONSES_URL")"

if [ "$HTTP_CODE" != "200" ]; then
  echo "translator upstream unhealthy: HTTP $HTTP_CODE from $RESPONSES_URL" >&2
  cat "$BODY_FILE" >&2 || true
  exit 1
fi

python3 - "$BODY_FILE" <<'PY'
import json, sys
path = sys.argv[1]
try:
    data = json.load(open(path, encoding='utf-8'))
except Exception as exc:
    print(f'translator upstream unhealthy: invalid JSON: {exc}', file=sys.stderr)
    sys.exit(1)
if data.get('status') != 'completed':
    print(f'translator upstream unhealthy: status={data.get("status")!r}', file=sys.stderr)
    sys.exit(1)
print('translator upstream healthy')
PY
