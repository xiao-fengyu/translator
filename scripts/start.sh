#!/usr/bin/env bash
set -euo pipefail
cd /data/translator
nohup npm start > translator.log 2>&1 &
echo $! > translator.pid
echo "translator started pid=$(cat translator.pid) log=/data/translator/translator.log"
