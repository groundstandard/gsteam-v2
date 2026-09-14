#!/usr/bin/env bash
# scripts/bump-pwa-version.sh
#
# Bumps the PWA build stamp in three places so that installed PWAs detect the
# new version and re-cache the app shell. Run this before every commit that
# changes frontend files (anything under src/, index.html, or service-worker.js).
#
# Bobby 2026-05-05: "When I save a new version to my desktop it does not show
# the updates. It keeps going back to the older version." Root cause was a
# stale VERSION constant in service-worker.js — without bumping it, the
# browser doesn't reinstall the SW and the SHELL precache stays frozen.
#
# Usage:
#   bash scripts/bump-pwa-version.sh
#
# Then `git diff` to confirm three files changed:
#   - service-worker.js  (VERSION constant)
#   - index.html         (build-comment + window.CABT_BUILD)

set -euo pipefail

ts="$(date +%s)"

cd "$(dirname "$0")/.."

# 1) service-worker.js — VERSION constant
sed -i.bak -E "s/^const VERSION = '[0-9]+';/const VERSION = '${ts}';/" service-worker.js && rm -f service-worker.js.bak

# 2) index.html — build-comment line
sed -i.bak -E "s/(<!-- PWA · injected by scripts\/build-pwa\.sh · build )[0-9]+( -->)/\\1${ts}\\2/" index.html && rm -f index.html.bak

# 3) index.html — window.CABT_BUILD
sed -i.bak -E "s/(window\.CABT_BUILD = ')[0-9]+(';)/\\1${ts}\\2/" index.html && rm -f index.html.bak

echo "[bump-pwa-version] PWA version bumped to ${ts}"
echo "  service-worker.js → VERSION = '${ts}'"
echo "  index.html        → build-comment + CABT_BUILD = '${ts}'"
