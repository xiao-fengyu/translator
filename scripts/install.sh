#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="codex-translator.service"
UNIT_PATH="/etc/systemd/system/$SERVICE_NAME"
TMP_UNIT="$(mktemp)"
INSTALL_DEPS="${INSTALL_DEPS:-1}"

cleanup() {
  rm -f "$TMP_UNIT"
}
trap cleanup EXIT

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl is required for installation" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required for installation" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required for installation" >&2
  exit 1
fi

if [ "$INSTALL_DEPS" = "1" ] && [ ! -d "$PROJECT_ROOT/node_modules" ]; then
  echo "installing npm dependencies"
  (cd "$PROJECT_ROOT" && npm install)
fi

if [ ! -f "$PROJECT_ROOT/.env" ]; then
  cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
  chmod 600 "$PROJECT_ROOT/.env"
  echo "created $PROJECT_ROOT/.env from .env.example"
fi

if [ -z "${UPSTREAM_API_KEY:-}" ] && grep -q '^UPSTREAM_API_KEY=replace-me$' "$PROJECT_ROOT/.env"; then
  echo "warning: .env still contains placeholder UPSTREAM_API_KEY=replace-me" >&2
fi

sed -e "s|@PROJECT_ROOT@|$PROJECT_ROOT|g" \
    -e 's|@USER@|root|g' \
    -e 's|@GROUP@|root|g' \
    "$PROJECT_ROOT/deploy/codex-translator.service" > "$TMP_UNIT"

sudo install -m 644 "$TMP_UNIT" "$UNIT_PATH"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"
sudo systemctl --no-pager --full status "$SERVICE_NAME" | sed -n '1,12p'

echo "installed $SERVICE_NAME for $PROJECT_ROOT"
