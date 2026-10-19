#!/bin/zsh
# Screenshots of the Peck map in the simulator at given levels, on a mock map.
#   scripts/peck-world/sim-shots.sh <outdir> <count> <current> <level>... [-- dark]
# Needs a built Debug-iphonesimulator Feynd.app at $APP (default /private/tmp/claude-501/dd-feynd/...),
# F2_TEST_PASS from .env.local, and a booted iPhone 17 Pro ($UD).
set -e
cd "$(dirname $0)/../.."
set -a; source ./.env.local; set +a
OUT=$1; COUNT=$2; CUR=$3; shift 3
DARK=0; LEVELS=()
for a in "$@"; do if [[ $a == dark ]]; then DARK=1; else LEVELS+=($a); fi; done
UD=${UD:-948D7AB5-C318-4542-B5C4-4AB8E3FA42A7}
APP=${APP:-/private/tmp/claude-501/dd-feynd/Build/Products/Debug-iphonesimulator/Feynd.app}
mkdir -p $OUT
xcrun simctl ui $UD appearance $([[ $DARK == 1 ]] && echo dark || echo light)
xcrun simctl install $UD $APP
for L in $LEVELS; do
  xcrun simctl terminate $UD com.bartdecrem.Feynd 2>/dev/null || true
  ARGS=(-TestLoginUser newx-test@example.com -TestLoginPass "$F2_TEST_PASS" -hasSeenOnboarding 1 -StartTab peck
        -MockLevelCount $COUNT -MockCurrentLevel $CUR -ScrollToLevel $L -NoSFX 1 -SkipNotifPrompt 1 -streakCelebrated 100
        -activelyReadBannerDismissed $(date +%F) -peckWeekBannerDismissed $(date +%F))
  xcrun simctl launch $UD com.bartdecrem.Feynd "${ARGS[@]}" >/dev/null
  sleep ${WAIT:-11}
  xcrun simctl io $UD screenshot $OUT/L$L$([[ $DARK == 1 ]] && echo -dark).png >/dev/null 2>&1
  echo "shot L$L"
done
xcrun simctl ui $UD appearance light
