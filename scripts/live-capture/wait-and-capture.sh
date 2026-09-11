#!/bin/bash
# Wait until at least one rollout is deploying/baking, then capture desktop,
# then mobile, so Home's "In motion" section and the Changes meters are lit.
# Kick off motion first: (cd ../../../rollout-dashboard && scripts/build-and-push.sh)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="${URL_BASE:-https://127.0.0.1:5173}"
motion() { curl -sk "$BASE/api/rollouts" | jq '[.rollouts.items[] | .status.history[0].bakeStatus // "" | select(. == "Deploying" or . == "InProgress")] | length'; }
for i in $(seq 1 180); do n=$(motion); echo "$(date +%T) moving=$n"; if [ "${n:-0}" -ge 1 ]; then break; fi; sleep 10; done
echo "capturing desktop"; node "$HERE/capture-live.mjs" desktop
echo "moving now=$(motion)"; echo "capturing mobile"; node "$HERE/capture-live.mjs" mobile
echo "done moving=$(motion)"
