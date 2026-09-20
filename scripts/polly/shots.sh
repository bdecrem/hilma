#!/bin/zsh
# The Polly screenshot set, on the booted iOS simulator, driven by launch hooks
# only (no taps). Needs a Debug simulator build installed and a demo account:
#   xcodebuild -project apps/polly/Polly.xcodeproj -scheme Polly \
#     -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -derivedDataPath <dd> build
#   xcrun simctl install booted <dd>/Build/Products/Debug-iphonesimulator/Polly.app
#   node scripts/polly/shots-seed.mjs <dir>
#   scripts/polly/shots.sh <dir>              → <dir>/shots/*.png + contact-sheet.png
#   node scripts/polly/shots-seed.mjs <dir> --delete
# The voice shots open real (short) live sessions, and the -AutoTalk shots type
# real turns (a few LLM calls each). If the simulator's audio service is wedged
# (an AUVoiceIO abort in the crash log), the voice shots come out as the home screen.
set -e
DIR=${1:?usage: shots.sh <dir with demo.json>}
APP=com.bartdecrem.Polly
j() { python3 -c "import json;d=json.load(open('$DIR/demo.json'));print(d$1)"; }
U=$(j "['username']"); P=$(j "['pass']")
INF=$(j "['topics']['infinity']"); GL=$(j "['topics']['guest_lesson']"); LES=$(j "['topics']['lesson']")
mkdir -p $DIR/shots
xcrun simctl status_bar booted override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
xcrun simctl privacy booted grant microphone $APP
snap() { xcrun simctl io booted screenshot $DIR/shots/$1.png 2>/dev/null; echo "shot $1"; }
shot() { # shot <name> <wait-seconds> [launch args…]
  local name=$1 wait=$2; shift 2
  xcrun simctl terminate booted $APP 2>/dev/null || true
  xcrun simctl launch booted $APP -TestLoginUser $U -TestLoginPass $P -SkipNotifPrompt 1 -NoSFX 1 "$@" >/dev/null
  sleep $wait; snap $name
}
# First run: no hook = the first panel, -OnboardingPage 1|2|3 = the rest. It
# only shows signed out, so wipe what a previous run left in the container.
xcrun simctl terminate booted $APP 2>/dev/null || true
DATA=$(xcrun simctl get_app_container booted $APP data)
rm -rf "$DATA/Library/Cookies" "$DATA/Library/HTTPStorages" "$DATA/Library/Caches" "$DATA/Library/Application Support" "$DATA/Documents"
xcrun simctl launch booted $APP -SkipNotifPrompt 1 >/dev/null; sleep 5; snap 01-first-run-1
for p in 1 2 3; do
  xcrun simctl terminate booted $APP 2>/dev/null || true
  xcrun simctl launch booted $APP -OnboardingPage $p -SkipNotifPrompt 1 >/dev/null; sleep 4; snap 01-first-run-$((p+1))
done
shot 02-topics 9 -StartTab topics
# Infinity Chat (Direction 2b): the home, the text chat, a chat's page
shot 10-infinity-home 10 -StartTab topics -OpenTopic $INF
shot 11-infinity-text-chat 45 -StartTab topics -OpenTopic $INF -OpenInfinityDrill text \
  -AutoTalk "Ieri ho mangiato il sushi con mia moglie, era molto buona|Polly, make 4 cards from this chat, food only" -AutoTalkEnd leave -AutoTalkHold 8
shot 12-infinity-journey 11 -StartTab topics -OpenTopic $INF
shot 13-infinity-chat-page 13 -StartTab topics -OpenTopic $INF -OpenInfinityDrill page
shot 14-infinity-vocab 14 -StartTab topics -OpenTopic $INF -OpenInfinityDrill vocab
shot 15-infinity-grammar 14 -StartTab topics -OpenTopic $INF -OpenInfinityDrill grammar
shot 16-infinity-quiz 20 -StartTab topics -OpenTopic $INF -OpenInfinityDrill quiz
shot 17-infinity-continue-typing 26 -StartTab topics -OpenTopic $INF -OpenInfinityDrill type
shot 18-infinity-cleanup-walk 30 -StartTab topics -OpenTopic $INF -OpenInfinityDrill cleanup
shot 19-infinity-talk 16 -StartTab topics -OpenTopic $INF -OpenVoice 1
# Agentic Learning Mode: the path and a Polly-written lesson
shot 20-path-lesson 10 -StartTab topics -OpenTopic $LES
shot 21-path-lesson-read 12 -StartTab topics -OpenTopic $LES -OpenLesson 1
shot 22-path-lesson-typed-scene 34 -StartTab topics -OpenTopic $LES -OpenTextChat 1 -AutoTalk "Buonasera! Vorrei una pizza margherita, per favore"
shot 23-path-lesson-talk 18 -StartTab topics -OpenTopic $LES -OpenVoice 1
# A guest lesson
shot 30-guest-lesson 10 -StartTab topics -OpenTopic $GL
shot 31-guest-lesson-plan 12 -StartTab topics -OpenTopic $GL -OpenLesson 1
shot 34-guest-lesson-text-chat 36 -StartTab topics -OpenTopic $GL -OpenTextChat 1 \
  -AutoTalk "Casanova è scandaloso perché lui ha molte amante|what does libertino mean exactly?"
shot 35-guest-lesson-quiz 24 -StartTab topics -OpenTopic $GL -OpenTopicQuiz 1
shot 32-guest-lesson-cards 12 -StartTab topics -OpenTopic $GL -OpenFlashCards 1
shot 33-guest-lesson-card-list 13 -StartTab topics -OpenTopic $GL -OpenFlashCards 1 -ShowCardList 1
# Peck
shot 40-peck 10 -StartTab flash
shot 41-peck-set-mixed 16 -StartTab flash -AutoPlayLevel 1 -AutoPlayMode mixed
shot 42-peck-set-type 16 -StartTab flash -AutoPlayLevel 1
shot 43-peck-results 30 -StartTab flash -AutoPlayLevel 1 -AutoPlayMode mixed -AutoFinishSet 1
shot 44-peck-set-choice 16 -StartTab flash -AutoPlayLevel 1 -AutoPlayMode choice
shot 45-peck-miss-clinic 34 -StartTab flash -AutoPlayLevel 1 -AutoPlayMode mixed -AutoFinishSet 1 -OpenMissClinic 1
shot 46-peck-clinic-chat 60 -StartTab flash -AutoPlayLevel 1 -AutoPlayMode mixed -AutoFinishSet 1 -OpenMissClinic 1 -AutoDiscuss 1 -AutoTalk "non lo so"
# The level check, the profile and the rest
shot 50-level-check-intro 10 -StartTab topics -OpenPlacement 1
shot 60-profile 11 -StartTab flash -OpenProfile 1
shot 61-language-switcher 11 -StartTab flash -OpenProfile 1 -OpenLanguages 1
shot 62-new-topic 14 -StartTab topics -OpenNewTopic 1
shot 66-ask-polly 30 -StartTab topics -OpenAskPolly 1 -AutoTalk "how do I say 'I would like the bill' in Italian?"
shot 63-streak 11 -StartTab flash -OpenStreakModal 1 -MockStreak 7
shot 64-peck-decks 12 -StartTab flash -OpenDecks 1
shot 65-community 12 -StartTab topics -OpenCommunity 1
xcrun simctl terminate booted $APP 2>/dev/null || true
python3 - $DIR <<'PY'
import sys, glob, os
from PIL import Image, ImageDraw
d = sys.argv[1]; files = sorted(glob.glob(f"{d}/shots/*.png"))
w, h, cols = 300, 652, 8
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * (h + 22)), 'white'); draw = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    x, y = (i % cols) * w, (i // cols) * (h + 22)
    sheet.paste(Image.open(f).convert('RGB').resize((w, h)), (x, y + 22)); draw.text((x + 4, y + 4), os.path.basename(f)[:-4], fill='black')
sheet.save(f"{d}/contact-sheet.png")
PY
echo "done: $DIR/shots, $DIR/contact-sheet.png"
