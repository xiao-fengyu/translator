#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$PROJECT_ROOT/translator.pid"
LOG_FILE="$PROJECT_ROOT/translator.log"
SERVICE_NAME="codex-translator.service"

read_env_value() {
  local key="$1"
  [ -f "$PROJECT_ROOT/.env" ] || return 1
  grep -E "^${key}=" "$PROJECT_ROOT/.env" | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

PORT="${TRANSLATOR_PORT:-$(read_env_value TRANSLATOR_PORT || echo 3000)}"
HEALTH_URL="${TRANSLATOR_HEALTH_URL:-http://127.0.0.1:$PORT/healthz}"

cd "$PROJECT_ROOT"

service_exists() {
  command -v systemctl >/dev/null 2>&1 && systemctl cat "$SERVICE_NAME" >/dev/null 2>&1
}

service_active() {
  command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$SERVICE_NAME"
}

listener_pid() {
  ss -ltnp 2>/dev/null \
    | awk -v port=":$PORT" '$4 ~ port { print $0 }' \
    | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' \
    | head -n 1
}

wait_healthy() {
  for _ in $(seq 1 20); do
    if curl -fsS -m 2 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

if service_active; then
  echo "translator already managed by $SERVICE_NAME"
  systemctl --no-pager --lines=0 status "$SERVICE_NAME" | sed -n '1,8p'
  exit 0
fi

pid="$(listener_pid || true)"
if [ -n "$pid" ]; then
  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  echo "translator port $PORT is already in use by pid=$pid cwd=${cwd:-unknown}; not starting another instance"
  if [ "$cwd" = "$PROJECT_ROOT" ]; then
    echo "$pid" > "$PID_FILE"
  fi
  exit 0
fi

if [ -f "$PID_FILE" ] && ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  rm -f "$PID_FILE"
fi

if service_exists; then
  systemctl start "$SERVICE_NAME"
  wait_healthy
  echo "translator started via $SERVICE_NAME"
  exit 0
fi

nohup npm start > "$LOG_FILE" 2>&1 &
pid="$!"
echo "$pid" > "$PID_FILE"

if ! wait_healthy; then
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$PID_FILE"
  fi
  echo "translator failed to become healthy; see $LOG_FILE" >&2
  exit 1
fi

echo "translator started pid=$pid log=$LOG_FILE"
