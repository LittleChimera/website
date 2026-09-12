#!/usr/bin/env bash
# Capture landing-page dashboard screenshots.
#
# Boots the rollout-dashboard in MOCK_API mode (no cluster needed), drives a
# headless browser through a curated set of routes, dumps PNGs into
# website/static/screenshots/dashboard/. Re-run any time the dashboard
# redesigns. Toggling the curated set is one line.
#
# Deps: node + browse binary (gstack) + rollout-dashboard checkout sibling
# to website/.
#
# Usage:
#   scripts/capture-dashboard.sh          # capture all
#   scripts/capture-dashboard.sh --keep   # leave mock dashboard running
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBSITE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DASH_DIR="$(cd "$WEBSITE_DIR/../rollout-dashboard/frontend" && pwd)"
OUT_DIR="$WEBSITE_DIR/static/screenshots/dashboard"

HOST=127.0.0.1
# 5180 keeps clear of the dashboard's default 5173 (often running in preview).
PORT="${PORT:-5180}"
URL_BASE="https://$HOST:$PORT"

BROWSE="${BROWSE:-$HOME/.claude/skills/gstack/browse/dist/browse}"
# Two viewports: a desktop crop and a mobile crop. Landing serves whichever
# matches the visitor's screen via <picture>.
VIEWPORT_DESKTOP="${VIEWPORT_DESKTOP:-1440x900}"
VIEWPORT_MOBILE="${VIEWPORT_MOBILE:-414x896}"
# 2x devicePixelRatio so the PNGs stay crisp on retina displays. The PNG
# dimensions come out doubled; CSS sizes the image to the logical viewport.
SCALE="${SCALE:-2}"

KEEP_RUNNING=0
[[ "${1:-}" == "--keep" ]] && KEEP_RUNNING=1

mkdir -p "$OUT_DIR"

# Curated set. Each entry: <route>|<output basename>.
#   - apps:     app-grouped fleet — multiple envs per app with version spreads
#   - overview: deployment pipeline, health checks, resources (drilled in)
#   - activity: deployment timeline grouped by recency, with failures
# Adding more? Keep the count small; the landing rotates them.
# The changes pages read GitHub as the viewing user; the mock API has no
# /api/github, so capture those against a live dashboard with
# GITHUB_DEV_TOKEN set (URL_BASE=https://127.0.0.1:5173) — see
# rollout-dashboard/frontend/README.md. The 2026-09-11 set was captured live.
ROUTES=(
  "|home"
  "changes|changes"
  "changes/github.com/littlechimera/kuberik-testing/pull/4|change"
  "apps|apps"
  "rollouts/dev/hello-dep-dev/hello-frontend-app|overview"
  "rollouts/dev/hello-multi-dev/hello-multi-app/history|history"
  "activity|activity"
  "rollouts|rollouts"
  "environments|environments"
  "dependencies|dependencies"
  "rollouts/dev/hello-dep-dev/hello-frontend-app/dependencies|rollout-dependencies"
)
# held-schedule, held-approval and change-version need a click first:
# scripts/live-capture/dialogs.mjs against the live dashboard.
# Richer shots: run scripts/build-and-push.sh in rollout-dashboard first and
# capture while rollouts are deploying/checking (Home's "In motion" section,
# blue/yellow meters on Changes, "deploying" rows in History). The history
# shot wants the newest deploy expanded to show its commit changelist.

started_mock=0
if ! curl -sk -o /dev/null --max-time 2 "$URL_BASE/api/rollouts/default/hello-world"; then
  echo "→ starting mock dashboard ($DASH_DIR)…"
  (cd "$DASH_DIR" && MOCK_API=1 ./node_modules/.bin/vite dev --host "$HOST" --port "$PORT" \
    >/tmp/dashboard-mock.log 2>&1 &)
  started_mock=1

  # wait up to 30s for mock endpoint to come up
  ready=0
  for _ in $(seq 1 30); do
    sleep 1
    if curl -sk -o /dev/null --max-time 2 "$URL_BASE/api/rollouts/default/hello-world"; then
      ready=1; break
    fi
  done
  if [[ $ready -eq 0 ]]; then
    echo "✗ mock dashboard did not come up — see /tmp/dashboard-mock.log" >&2
    exit 1
  fi
fi

cleanup() {
  if [[ $started_mock -eq 1 && $KEEP_RUNNING -eq 0 ]]; then
    echo "→ stopping mock dashboard…"
    pkill -f "vite dev --host $HOST --port $PORT" || true
  fi
}
trap cleanup EXIT

# Headless Chromium on Linux has no Inter/SF Pro/Segoe — Tailwind's `font-sans`
# falls back to DejaVu/Liberation, which doesn't match what the dashboard looks
# like on macOS. Inject Inter from Google Fonts and override the default stack,
# then wait for every weight to actually load before capturing.
PREP_JS=$(cat <<'JS'
(async () => {
  localStorage.setItem('theme', 'dark');
  document.documentElement.classList.add('dark');
  if (!document.getElementById('cap-inter')) {
    const link = document.createElement('link');
    link.id = 'cap-inter';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
    const style = document.createElement('style');
    style.textContent = `:root, html, body, button, input, select, textarea, [class*="font-sans"] { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif !important; }`;
    document.head.appendChild(style);
  }
  await document.fonts.ready;
  await Promise.all(
    [300, 400, 500, 600, 700].flatMap(w => [
      document.fonts.load(`${w} 16px Inter`),
      document.fonts.load(`${w} 16px Montserrat`)
    ])
  );
})();
JS
)

# Prime the SPA at desktop viewport.
"$BROWSE" viewport "$VIEWPORT_DESKTOP" --scale "$SCALE" >/dev/null
"$BROWSE" goto "$URL_BASE/rollouts/default/hello-world" >/dev/null
"$BROWSE" wait --networkidle >/dev/null 2>&1 || true
"$BROWSE" js "$PREP_JS" >/dev/null

capture_at() {
  local viewport="$1" suffix="$2"
  echo "→ viewport $viewport @${SCALE}x"
  "$BROWSE" viewport "$viewport" --scale "$SCALE" >/dev/null
  # Scale changes invalidate the context — re-inject Inter + dark theme.
  "$BROWSE" goto "$URL_BASE/rollouts/default/hello-world" >/dev/null
  "$BROWSE" wait --networkidle >/dev/null 2>&1 || true
  "$BROWSE" js "$PREP_JS" >/dev/null
  for entry in "${ROUTES[@]}"; do
    local route="${entry%%|*}"
    local name="${entry##*|}"
    local out="$OUT_DIR/${name}${suffix}.png"
    echo "  · $name → ${out#$WEBSITE_DIR/}"
    "$BROWSE" goto "$URL_BASE/$route" >/dev/null
    "$BROWSE" wait --networkidle >/dev/null 2>&1 || true
    "$BROWSE" js "$PREP_JS" >/dev/null
    sleep 2
    "$BROWSE" screenshot "$out" >/dev/null
  done
}

capture_at "$VIEWPORT_DESKTOP" ""
capture_at "$VIEWPORT_MOBILE"  "-mobile"

echo "✓ done. $((${#ROUTES[@]} * 2)) screenshots in $OUT_DIR"
