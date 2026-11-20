#!/bin/zsh
# The document builder's run on the mini (a developer's script, not a suite): takes the suite lock,
# builds the image, runs the parts named in $1 (image ws fd web all), releases the lock.
#   zsh workspace/testdata/dx-run.sh "image ws fd"
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
cd ~/ola-dx/apps/activist-ai || exit 1
test -e ~/ola-deploy.hold && { echo "deploy hold; not taking the lock"; exit 1; }
until mkdir ~/ola-suite.lock 2>/dev/null; do sleep 3; done
echo "pid $$ dx $(date)" > ~/ola-suite.lock/owner; export OLA_TURN_HELD=$$
trap 'rm -rf ~/ola-suite.lock' EXIT
want="$1"
mkdir -p ~/ola-dx/logs
[[ "$want" == *image* || "$want" == *all* ]] && { node workspace/ws.mjs image > ~/ola-dx/logs/image.log 2>&1; echo "image $?"; }
[[ "$want" == *ws* ]] && { OLA_CHECK_TAG=dx node workspace/check-docs.mjs > ~/ola-dx/logs/ws-docs.log 2>&1; echo "ws-docs $?"; grep -E "FAIL|passed" ~/ola-dx/logs/ws-docs.log; }
[[ "$want" == *fd* ]] && (cd web && npm run build >/dev/null 2>&1; echo "web build $?")
[[ "$want" == *fd* ]] && { OLA_CHECK_TAG=dx OLA_CHECK_FD_PORT=4890 OLA_CHECK_GW_PORT=4282 OLA_CHECK_ONLY="${FD_ONLY:-documents|home lists|Open on|library in pieces|Settings shows the project}" node frontdesk/check.mjs --no-live --shots ~/ola-dx/shots > ~/ola-dx/logs/fd.log 2>&1; echo "fd $?"; grep -E "^(pass|FAIL)" ~/ola-dx/logs/fd.log | cut -c1-400; }
[[ "$want" == *web* ]] && { (cd web && OLA_WEB_SHOTS=~/ola-dx/shots node check.mjs --no-live > ~/ola-dx/logs/web.log 2>&1); echo "web $?"; grep -E "FAIL|passed|of [0-9]+" ~/ola-dx/logs/web.log | cut -c1-400; }
if [[ "$want" == *full* ]]; then
  (cd web && npm run build >/dev/null 2>&1; echo "web build $?")
  node --test gateway/test.mjs > ~/ola-dx/logs/full-gw.log 2>&1; echo "gateway $?"; grep -E "^# (pass|fail)" ~/ola-dx/logs/full-gw.log
  OLA_CHECK_TAG=dx OLA_CHECK_GW_PORT=4283 node workspace/check.mjs --no-live > ~/ola-dx/logs/full-ws.log 2>&1; echo "workspace $?"; grep -E "^FAIL|passed|of [0-9]+" ~/ola-dx/logs/full-ws.log | cut -c1-300 | tail -8
  OLA_CHECK_TAG=dx OLA_CHECK_FD_PORT=4890 OLA_CHECK_GW_PORT=4282 node frontdesk/check.mjs --no-live --shots ~/ola-dx/shots > ~/ola-dx/logs/full-fd.log 2>&1; echo "frontdesk $?"; grep -E "^FAIL|checks passed" ~/ola-dx/logs/full-fd.log | cut -c1-300
  (cd web && OLA_WEB_SHOTS=~/ola-dx/shots node check.mjs --no-live > ~/ola-dx/logs/full-web.log 2>&1); echo "web $?"; grep -E "FAIL|checks passed" ~/ola-dx/logs/full-web.log | cut -c1-300
fi
if [[ "$want" == *fdonly* ]]; then
  (cd web && npm run build >/dev/null 2>&1; echo "web build $?")
  OLA_CHECK_TAG=dx OLA_CHECK_FD_PORT=4890 OLA_CHECK_GW_PORT=4282 node frontdesk/check.mjs --no-live --shots ~/ola-dx/shots > ~/ola-dx/logs/full-fd.log 2>&1; echo "frontdesk $?"; grep -E "^FAIL|checks passed" ~/ola-dx/logs/full-fd.log | cut -c1-300
fi
if [[ "$want" == *live* ]]; then
  OLA_CHECK_TAG=dx OLA_CHECK_FD_PORT=4890 OLA_CHECK_GW_PORT=4282 OLA_CHECK_ONLY="^documents|^live: a scanned" node frontdesk/check.mjs --shots ~/ola-dx/shots > ~/ola-dx/logs/live-fd.log 2>&1; echo "live $?"; grep -E "^(pass|FAIL)|checks passed" ~/ola-dx/logs/live-fd.log | cut -c1-600
  grep -c '"caller":"ws-dx-fd-a"' ~/ola-dx/logs/live-fd.log
fi
container list --all 2>/dev/null | grep -E "ola-dx-" || true
