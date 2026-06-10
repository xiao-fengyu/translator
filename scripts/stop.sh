#!/usr/bin/env bash
set -euo pipefail
cd /data/translator
if [ -f translator.pid ] && kill -0 "$(cat translator.pid)" 2>/dev/null; then
  kill "$(cat translator.pid)" 2>/dev/null || true
fi
# Kill only node workers whose argv contains this project path or exact src entrypoint.
pgrep -af 'node .*src/index\.ts|node .*/data/translator/src/index\.ts' \
  | awk '{print $1}' \
  | while read -r pid; do
      [ -n "$pid" ] && [ "$pid" != "$$" ] && kill "$pid" 2>/dev/null || true
    done
rm -f translator.pid
echo "translator stopped"
