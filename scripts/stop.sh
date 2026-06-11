#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"
if [ -f "$PROJECT_ROOT/translator.pid" ] && kill -0 "$(cat "$PROJECT_ROOT/translator.pid")" 2>/dev/null; then
  kill "$(cat "$PROJECT_ROOT/translator.pid")" 2>/dev/null || true
fi
pgrep -af "node .*${PROJECT_ROOT}/src/index\\.ts|node .*src/index\\.ts" \
  | awk '{print $1}' \
  | while read -r pid; do
      [ -n "$pid" ] && [ "$pid" != "$$" ] && kill "$pid" 2>/dev/null || true
    done
rm -f "$PROJECT_ROOT/translator.pid"
echo "translator stopped"
