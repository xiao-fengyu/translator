#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
INSTALL_DEPS="${INSTALL_DEPS:-1}"

cd "$PROJECT_ROOT"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required for upgrade" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "$PROJECT_ROOT is not a git repository" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "working tree has local changes; commit or stash them before upgrading" >&2
  git status --short
  exit 1
fi

upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
if [ -z "$upstream" ]; then
  echo "current branch has no upstream; set one with git branch --set-upstream-to" >&2
  exit 1
fi

echo "fetching latest $upstream"
git fetch --prune

current_rev="$(git rev-parse HEAD)"
remote_rev="$(git rev-parse "$upstream")"

if [ "$current_rev" = "$remote_rev" ]; then
  echo "already up to date: $current_rev"
else
  if ! git merge-base --is-ancestor "$current_rev" "$remote_rev"; then
    echo "local branch cannot fast-forward to $upstream; resolve git history manually" >&2
    exit 1
  fi

  echo "upgrading $current_rev -> $remote_rev"
  git merge --ff-only "$upstream"
fi

if [ "$INSTALL_DEPS" = "1" ]; then
  npm install
fi

INSTALL_DEPS=0 "$PROJECT_ROOT/scripts/install.sh"

echo "translator upgraded to $(git rev-parse --short HEAD)"
