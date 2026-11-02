#!/usr/bin/env bash
# Uso: scripts/mark-tasks.sh T004 T005 ...  → marca tareas como hechas en tasks.md
set -euo pipefail
f="specs/001-bombo-bingo-offline/tasks.md"
for t in "$@"; do
  grep -q -- "^- \[ \] $t " "$f" || { echo "no pendiente: $t" >&2; continue; }
  sed -i '' "s/^- \[ \] $t /- [x] $t /" "$f"
done
