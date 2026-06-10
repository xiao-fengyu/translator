#!/usr/bin/env bash
set -euo pipefail
cd /data/translator
if [ -f translator.pid ] && kill -0 "$(cat translator.pid)" 2>/dev/null; then
  kill "$(cat translator.pid)"
  rm -f translator.pid
  echo "translator stopped"
else
  pkill -f '/data/translator/src/index.ts' 2>/dev/null || true
  rm -f translator.pid
  echo "translator was not running or was stopped by pattern"
fi
