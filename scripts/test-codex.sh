#!/usr/bin/env bash
set -euo pipefail
curl -sS http://127.0.0.1:3000/healthz
printf '\n'
curl -sS http://127.0.0.1:3000/v1/models | head -c 500
printf '\n'
