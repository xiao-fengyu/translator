#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$PROJECT_ROOT/translator.pid"
SERVICE_NAME="codex-translator.service"

read_env_value() {
  local key="$1"
  [ -f "$PROJECT_ROOT/.env" ] || return 1
  grep -E "^${key}=" "$PROJECT_ROOT/.env" | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

PORT="${TRANSLATOR_PORT:-$(read_env_value TRANSLATOR_PORT || echo 3000)}"

cd "$PROJECT_ROOT"

service_active() {
  command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet "$SERVICE_NAME"
}

listener_pid() {
  ss -ltnp 2>/dev/null \
    | awk -v port=":$PORT" '$4 ~ port { print $0 }' \
    | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' \
    | head -n 1
}

if service_active; then
  systemctl stop "$SERVICE_NAME"
  rm -f "$PID_FILE"
  echo "translator stopped via $SERVICE_NAME"
  exit 0
fi

if [ -f "$PID_FILE" ]; then
  pid="$(cat "$PID_FILE")"
  if kill -0 "$pid" 2>/dev/null; then
    cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
    if [ "$cwd" = "$PROJECT_ROOT" ]; then
      kill "$pid" 2>/dev/null || true
    else
      echo "refusing to kill pid=$pid because cwd=${cwd:-unknown} is not $PROJECT_ROOT" >&2
    fi
  fi
  rm -f "$PID_FILE"
fi

pid="$(listener_pid || true)"
if [ -n "$pid" ]; then
  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  if [ "$cwd" = "$PROJECT_ROOT" ] && [[ "$cmd" == *"node src/index.ts"* ]]; then
    kill "$pid" 2>/dev/null || true
    echo "translator stopped pid=$pid"
    exit 0
  fi
  echo "port $PORT is used by pid=$pid cwd=${cwd:-unknown}; not killed" >&2
  exit 1
fi

echo "translator stopped"
