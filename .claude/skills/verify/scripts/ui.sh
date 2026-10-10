#!/usr/bin/env bash
# Usage: ui.sh <playwright-cli command> [args...]
# Drives the browser session `taskly-verify` with a pinned playwright-cli, from the run's evidence
# directory, so relative --filename paths and auto-saved snapshots land in the evidence.
# playwright-cli exits 0 even when an action fails; this exits 1 when its output reports an error.
set -euo pipefail
instance="$("$(dirname "$0")/stack.sh" env)"
eval "$instance"
cd "$EVIDENCE"
output="$(npx -y @playwright/cli@0.1.22 -s=taskly-verify "$@" 2>&1)" || { printf '%s\n' "$output"; exit 1; }
printf '%s\n' "$output"
! grep -q '^### Error' <<< "$output"
