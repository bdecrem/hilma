# Dodo scenes

One manifest of app moments — `scenes.json` — behind every place the app is
shown: the dodogo.cc tour and hero, the App Store screenshots, the overview
video and feature cards. Adding a feature is adding one scene and running
one command.

## The loop

```bash
pnpm dodo:seed              # once, or after changing the demo content
pnpm dodo:capture           # simulator → raw/ → public/dodo/scenes + contact-sheet.png
pnpm dodo:capture --dark    # also capture the dark appearance (off by default)
pnpm dodo:capture --only peck,chat
pnpm dodo:capture --export  # re-export from raw/ without touching the simulator
```

`capture.mjs` needs a simulator build of the Feynd scheme in DerivedData
(`xcodebuild -project apps/feynd/Feynd.xcodeproj -scheme Feynd -destination
'platform=iOS Simulator,name=iPhone Air' build`). Look at `contact-sheet.png`
after every run: legacy and missing frames are labelled in marigold.

## A scene

```json
{
  "id": "flash-hub",
  "line": "It writes your **flash cards.**",
  "tour": "Generate flash cards. Say how many and what to focus on.",
  "launch": ["-StartTab", "topics", "-OpenTopic", "$T_ODYSSEY", "-OpenFlashCards", "1"],
  "settle": 14,
  "capture": "still",
  "focus": { "x": 0.04, "y": 0.13, "w": 0.92, "h": 0.42 },
  "bird": "point",
  "sets": ["hero", "tour", "appstore", "video"]
}
```

- `line` — the hero/App Store caption; `**word**` is the one marigold word.
- `tour` — the longer caption under the tour phone.
- `launch` — simulator launch arguments (the app's Debug-only hooks, listed
  in `apps/feynd/CLAUDE.md`). `$T_<KEY>` resolves to a demo topic id from
  `seed-state.json`.
- `settle` — seconds to wait before the screenshot.
- `legacy` — a hand-made still to use until the screen has a launch hook.
  `clip` — an mp4 to use as is. Both are flagged on the contact sheet.
- `focus` — the screen window (fractions of width/height) the hero and App
  Store frames zoom to; omit for full frame.
- `bird` — the mascot's reaction in the hero: `idle`, `point`, `peek`,
  `hop`, `cheer`.
- `sets` — where the scene appears. The `hero` list at the top of the
  manifest fixes the hero order.

## The demo account

`seed.mjs` builds the learner every screenshot shows: five topics with
titles chosen for the header, a staged two-turn chat, a gold badge and a
lapsed one, past rounds, four Peck levels, a seven-day streak, three
pebbles, an avatar. Content goes through the real `/api/f2` endpoints;
progress state is written to Supabase. Credentials: username `demo`,
password `DODO_DEMO_PASS` in `.env.local`. `--fresh` wipes and rebuilds.
