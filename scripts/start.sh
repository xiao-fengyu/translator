#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"
nohup npm start > "$PROJECT_ROOT/translator.log" 2>&1 &
echo $! > "$PROJECT_ROOT/translator.pid"
echo "translator started pid=$(cat "$PROJECT_ROOT/translator.pid") log=$PROJECT_ROOT/translator.log"
