#!/usr/bin/env bash
set -euo pipefail
curl -sS http://127.0.0.1:3002/healthz
printf '\n'
curl -sS http://127.0.0.1:3002/v1/models | head -c 500
printf '\n'
