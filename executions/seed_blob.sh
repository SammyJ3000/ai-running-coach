#!/bin/bash
# One-off: copy the local runs, knee check-ins, plan and reviews (tmp/store) into the live Vercel Blob store.
# Run it yourself. It pulls the Development env (Blob store ID and a short-lived Vercel login token,
# no Anthropic key or app passcode) into a temp folder, uploads, then deletes the temp folder.
# Prints variable NAMES only, never values.
set -uo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
vercel env pull "$TMP/.env" --environment=development --yes >/dev/null 2>&1
echo "Variables pulled (names only):"
grep -oE '^[A-Z_]+' "$TMP/.env" | sed 's/^/  /'
set -a; . "$TMP/.env"; set +a
for f in runs/all.json runs/checkins.json coach/plan.json coach/reviews.json; do
  out=$(vercel blob put "tmp/store/$f" --pathname "$f" --access private \
    --allow-overwrite true --content-type application/json 2>&1)
  if [ $? -eq 0 ]; then echo "uploaded $f"; else echo "FAILED $f:"; echo "$out" | grep -v '^Vercel CLI' | grep -viE 'token=|eyJ' | head -6; break; fi
done
echo "Files in the store:"
vercel blob list 2>&1 | grep -v '^Vercel CLI' | grep -viE 'token=|eyJ' | head -10
