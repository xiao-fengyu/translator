#!/usr/bin/env bash
set -euo pipefail

MEMORY_FILE="${MEMORY_FILE:-/root/.codex-memory/memory.json}"
WINDOWS_HOST="${WINDOWS_HOST:-36.212.8.169}"
WINDOWS_USER="${WINDOWS_USER:-Administrator}"
WINDOWS_MEMORY_PATH="${WINDOWS_MEMORY_PATH:-C:/Users/Administrator/.codex-memory/memory.json}"
KNOWN_HOSTS_FILE="${KNOWN_HOSTS_FILE:-/root/.codex/tmp/known_hosts_eplatform}"
CONNECT_TIMEOUT="${CONNECT_TIMEOUT:-15}"
SERVER_ALIVE_INTERVAL="${SERVER_ALIVE_INTERVAL:-10}"
SERVER_ALIVE_COUNT_MAX="${SERVER_ALIVE_COUNT_MAX:-2}"

if [ ! -s "$MEMORY_FILE" ]; then
  echo "memory file is missing or empty: $MEMORY_FILE" >&2
  exit 1
fi

if ! command -v sshpass >/dev/null 2>&1; then
  echo "sshpass is required" >&2
  exit 1
fi

if ! command -v scp >/dev/null 2>&1; then
  echo "scp is required" >&2
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required" >&2
  exit 1
fi

if [ -z "${SSHPASS:-}" ]; then
  echo "SSHPASS must be set for Windows SSH authentication" >&2
  exit 1
fi

remote_tmp="${WINDOWS_MEMORY_PATH}.tmp"
remote_dir="$(dirname "$WINDOWS_MEMORY_PATH")"
remote="${WINDOWS_USER}@${WINDOWS_HOST}"

ssh_opts=(
  -o "ConnectTimeout=$CONNECT_TIMEOUT"
  -o "ServerAliveInterval=$SERVER_ALIVE_INTERVAL"
  -o "ServerAliveCountMax=$SERVER_ALIVE_COUNT_MAX"
  -o StrictHostKeyChecking=no
  -o "UserKnownHostsFile=$KNOWN_HOSTS_FILE"
)

sshpass -e ssh "${ssh_opts[@]}" "$remote" \
  "powershell -NoProfile -Command \"New-Item -ItemType Directory -Force -Path '${remote_dir}' | Out-Null\""

sshpass -e scp "${ssh_opts[@]}" "$MEMORY_FILE" "$remote:$remote_tmp"

sshpass -e ssh "${ssh_opts[@]}" "$remote" \
  "powershell -NoProfile -Command \"Move-Item -Force '${remote_tmp}' '${WINDOWS_MEMORY_PATH}'\""

echo "synced $MEMORY_FILE -> $remote:$WINDOWS_MEMORY_PATH"
