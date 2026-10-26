# Takt — Design & Engineering Brief (v1)

**What it is:** a piano course for grown-ups, delivered as a native iOS + Mac Catalyst app. It's the app a classically trained Berlin techno producer would make: the rigor of conservatory practice, the look and feel of studio hardware, and no twinkle twinkle. Level 1 is the blues, because that's where everyone should start.

**Who it's for:** adults who want to play blues and keys for electronic production. They've maybe tried lessons before and quit at level 1.

**Platforms:** Mac (Catalyst) first, iPhone second, one SwiftUI codebase. Bart develops on the Mac with an M-Audio Keystation Mini 32 MK3 over USB.

---

## 1. Product principles

1. **The band is already playing.** You never start in a menu. Every lesson opens with a groove running and you join it.
2. **Every drill has a job.** Scales, voicings and technique are introduced only because the groove you're about to play needs them.
3. **Rigor is measured, not claimed.** MIDI gives exact pitch and timing. Mastery gates decide when you move on. You can't skip.
4. **The reward is the arrangement.** Play clean and the band gets fuller: channels unmute one by one. Points and badges don't exist.
5. **The UI is in time.** Anything that animates, animates on the beat. Nothing eases around freely while music is playing.
6. **Leave with a loop.** Every lesson ends with something you played, exportable as MIDI into Ableton.

---

## 2. Design language

The tension between the two halves of our producer is the brand: **the conservatory and the club**. Score paper and step sequencers. Hairline staff lines and hard square pads. Quiet, exact, a little dry.

### Mood
- A drum machine at 3am, lit only by its own LEDs.
- Concert program typography: confident, sparse, lots of space.
- Mostly monochrome. One signal color that means "now."
- Hardware metaphors (mute buttons, LCD tempo readout, pad grids) drawn flat and precise. No skeuomorphic knobs, no wood, no gradients, no glow effects.

### Color tokens

| Token | Dark (default) | Light ("paper") | Use |
|---|---|---|---|
| `ground` | `#0D0D0D` | `#F2F0EB` | Window / screen background |
| `panel` | `#181818` | `#E6E3DC` | Cards, channel strips, pads at rest |
| `line` | `#2A2A2A` | `#CFCBC2` | Hairlines, staff lines, outlines |
| `text` | `#F2F0EB` | `#0D0D0D` | Primary text |
| `muted` | `#9A978F` | `#5E5B54` | Labels, secondary text (passes 4.5:1 on ground) |
| `signal` | `#FF5A1F` | `#D8430C` | **Now**: current bar, key to press, active channel LED |
| `cue` | `#8FB3FF` | `#2F5BD3` | **Next**: upcoming bar and key, gate rings |

Rules:
- `signal` and `cue` are the only accents. Never introduce a third.
- Now vs. next must also differ in **shape**, not just hue: current pad is **filled**, next pad is **outlined with a corner tick**.
- Correct/incorrect feedback never uses red/green. A missed note flashes the pad outline in `muted`; a clean chorus lights the gate ring in `cue`.

### Typography (system fonts only, no bundling)
- **Display:** SF Pro, `.fontWidth(.compressed)`, heavy. Lesson titles, the big tempo number. Think techno flyer.
- **Body:** SF Pro Text, regular/semibold, Dynamic Type.
- **Data & labels:** SF Mono, uppercase, +12% tracking, 11–13pt. Bar numbers, BPM, roman numerals, step labels.
- Numbers always as numerals (`90 bpm`, `Bar 9 / 12`, `3 of 3`).

### Motifs
- **Staff lines:** 5 hairlines in `line` used as section dividers and behind the lesson header. The only "classical" ornament.
- **Pads:** the 12-bar form is a 4×3 grid of square pads with small radius (6pt). Looks like a sequencer page.
- **Beat LEDs:** 4 small squares per active pad, lighting in sequence.
- **Channel strips:** the band is a mixer, not cartoon musicians. Each channel = name, mute button, level LED. Locked channels show the unlock condition (`AT 80`).
- **Tracklist:** the course is presented like a 12" record. Level 1 is an EP; lessons are tracks: `A1 Play the Form`, `A2 The Right Hand`, `B1 Shuffle`, …

### Motion
- All UI state changes that happen during playback are **quantized** to the beat or bar from the transport clock.
- Key press on the on-screen keyboard: 1-frame depress, no spring.
- Channel unmute: LED snaps on at the downbeat of the next bar, the level meter starts.
- Respect Reduce Motion: keep beat LEDs, drop everything else.

### Voice & copy
- Terse, warm, dry. Short imperatives. "Pinky on C. Hit it on the 1." "Again." "Clean. Up 5."
- No exclamation marks, no "Great job!", no emoji.
- English UI. Optional setting: German count-in ("eins, zwei, drei, vier").

---

## 3. Layouts

### Mac (primary) — min window 1100×720, resizable
```
┌────────────────────────────────────────────────────────────────┐
│ A1 PLAY THE FORM · STEP 1 ═══════════ (staff)   ▶ ■   70 BPM   │  transport bar
├──────────┬──────────────────────────────────────┬──────────────┤
│ DRUMS ●  │                                      │ COACH        │
│ BASS  ●  │      [ I ][ I ][ I ][ I ]            │ "Get ready.  │
│ KEYS  ○  │      [IV ][IV ][ I ][ I ]            │  F on the 1."│
│  at 80   │      [ V ][IV ][ I ][ V ]            │              │
│ HORNS ○  │                                      │ LAST CHORUS  │
│  at 90   │      BAR 5 / 12      CHORUS 2        │ rushed bar 9 │
├──────────┴──────────────────────────────────────┴──────────────┤
│  ▌▌ ▌▌▌ ▌▌ ▌▌▌   on-screen keyboard, 2 octaves, now/next keys  │
└────────────────────────────────────────────────────────────────┘
```
- Spacebar = play/pause. Esc = leave lesson. ⌘E = export loop.
- Keyboard strip mirrors what you play in real time (pressed keys darken).

### iPhone — portrait, stacked
Top to bottom: transport bar → channel strips as a compact 4-up row → coach line → 4×3 pad grid → 1.5-octave keyboard → chorus/gate footer. (Flow reference: the earlier "Blues Lesson 1" canvas mockup. Its warm visual style is superseded by this brief.)

---

## 4. Lesson 1 spec — "A1 Play the Form"

Left hand only. ~15 minutes. Key of C. Backing: drums + bass from the start; keys (Rhodes) and horns unlock.

**The form:** `C C C C | F F C C | G F C G` (I I I I | IV IV I I | V IV I V)

| Step | What you do | Tempo | Pass condition | Coach (examples) |
|---|---|---|---|---|
| 1 Roots on 1 | Root of each bar on beat 1 | 70 | 2 clean choruses | "Left hand. Pinky on C. Hit it on the 1." / "Get ready. F on the 1." |
| 2 Name it | 20-second theory card: you just played I, IV, V | — | Tap continue | "That's the whole blues. Three chords." |
| 3 Shuffle | Root on 1, fifth on 3 (C–G, F–C, G–D) | 70 | 2 clean choruses | "Root on 1. Fifth on 3. Lean back." |
| 4 Ramp | Same shuffle; +5 bpm after each clean chorus | 70→90 | Reach 90 | "Clean. Up 5." KEYS unmute at 80, HORNS at 90 |
| 5 Gate | Shuffle at 90 | 90 | 3 clean choruses (not necessarily consecutive; max 8 attempts per session, then "Pick it up tomorrow.") | "Three clean at 90 and it's yours." |
| 6 Payoff | Last chorus: band drops out for bars 11–12, you play the turnaround alone | 90 | Any completion | "Your turnaround. Alone." |

Ends on the result screen: piano roll of your chorus (bars 11–12 highlighted in `signal`), **Export MIDI**, **Play it back**, and `A2 The Right Hand` unlocked.

**"Clean chorus" definition (v1, tune later):**
- ≥ 90% of expected notes hit with the right pitch class
- Timing within ±100 ms of the target beat at ≤ 80 bpm, ±80 ms above 80 (widened from ±60 / ±45 on 2026-10-26: a student app)
- ≤ 2 extra notes per chorus (wrong or doubled)
- Pitch class matches in any octave between C2 and C5 (mini keyboards shift octaves; don't punish that)

---

## 5. Engineering

### Repo & project
- New app in the `hilma` monorepo: `apps/takt/Takt/` (adjust if Bart prefers a separate repo).
- Bundle ID `com.bartdecrem.Takt`. Scheme `Takt`.
- XcodeGen `project.yml`, same conventions as Dodo. Targets: iOS 17+, Mac Catalyst (macOS 14+) with **"Optimize Interface for Mac"** idiom.
- Add `apps/takt/CLAUDE.md` with build/run/TestFlight playbook, modeled on `apps/feynd/CLAUDE.md`.

### Carry over from Dodo
- XcodeGen setup, `bump-build.sh`, `ENABLE_DEBUG_DYLIB: NO` for device builds, signing/TestFlight flow.
- Standing rule: **spec the behavior in a few bullets before touching any user-facing flow.**
- Standing rule: **BUILD SUCCEEDED is not done.** Done = the flow works when run (Mac app launched, simulator via `simctl`).
- Later (not v1): ElevenLabs voice for the coach, using Dodo's voice plumbing; the F2 knowledge-model concept for the skill model.

### Do not carry over
- Dodo's visual design, level map, critters, arcade games, `/api/f2/*` backend, accounts. Takt v1 is **offline, local-only, no login**.

### Modules
1. **MIDIInput** — CoreMIDI client + input port, auto-connect to all sources, hot-plug handling. Parse note on/off + velocity from `MIDIEventList` (UMP). Keep host-time timestamps.
2. **Transport** — the single clock. Tempo, bar/beat position, derived from `AVAudioEngine` render time. Publishes beat/bar ticks for UI quantization. Converts MIDI host time → transport beat position.
3. **Band** — `AVAudioEngine` with one `AVAudioUnitSampler` per channel (drums, bass, keys, horns), driven by MIDI patterns so tempo changes need no time-stretching. Per-channel mute with bar-quantized unmute. Patterns are data (see Lesson data).
4. **Monitor** — the Keystation makes no sound, so play the user's notes through a Rhodes-style sampler with minimum latency (iOS: `preferredIOBufferDuration` ≈ 5 ms).
5. **Scorer** — matches played notes to expected events using the tolerance rules in §4. Outputs per-chorus result: accuracy, mean timing offset (rush/drag), per-bar problems.
6. **LessonEngine** — runs steps, evaluates gates, triggers coach lines and channel unlocks. Lessons are **JSON in the bundle** (form, steps, expected-note patterns, tempos, gates, coach lines, band patterns), so new lessons are content, not code.
7. **SkillModel** — SwiftData. One record per skill id (e.g. `lh.roots.blues12.C`, `lh.shuffle.blues12.C`): attempts, best clean tempo, timing bias, weak bars, last practiced. v1 only records and displays it ("rushed bar 9, saved for tomorrow's warm-up"); scheduling comes in v2.
8. **Export** — write the recorded chorus as a Standard MIDI File (type 0, 1 track). Mac: save panel, default name `Takt A1 Chorus 01.mid`. iOS: share sheet.
9. **Calibration** — first launch: tap a key with 8 clicks to measure input latency; store the offset and apply it in the Scorer.

### Dev without hardware
- **Mac computer-keyboard input:** home row maps to white keys (A=C3, S=D3, …), W/E/T/Y/U for black keys, Z/X for octave down/up. Ships in DEBUG; consider keeping it as a real feature.
- **On-screen keyboard is playable by touch/click** in all builds.
- A DEBUG "autoplay" toggle that plays the lesson perfectly, to test gates and unlocks fast.

### Audio content
- Band and Rhodes sounds: use samples with a clearly permissive license (CC0 or equivalent) and record every license in `Takt/Licenses/`. No ripped or commercial sample packs.
- Band patterns authored as MIDI, stored with the lesson JSON.

### Out of scope for v1
- Mic listening / "jam to anything" (v2: detect key and tempo of music in the room)
- Lessons beyond A1 (A2 stub screen only)
- Spaced repetition scheduling, transposition to other keys
- Accounts, sync, backend, payments, analytics

---

## 6. Milestones & acceptance

**M0 — Skeleton.** Both targets build and launch. Design tokens and type styles in place. Empty lesson screen renders on Mac and iPhone in dark and light.
*Accept:* screenshots of Mac window + iPhone simulator, both themes.

**M1 — Sound and input.** Transport + band play the C blues shuffle in a loop at a set tempo. Keystation (or computer keyboard) notes are heard through the Rhodes monitor and show on the on-screen keyboard.
*Accept:* play along on the Mac; no audible drift after 5 minutes; tempo change takes effect on the next bar.

**M2 — Step 1 playable.** Pad grid follows the transport (now/next), coach lines change with the form, Scorer judges choruses, gate passes after 2 clean.
*Accept:* autoplay passes the gate; deliberately sloppy play doesn't.

**M3 — Full Lesson 1.** Steps 1–6, ramp, channel unlocks at 80/90, gate at 90, band drop-out for the turnaround, result screen with piano roll, SkillModel records written.
*Accept:* complete the lesson end to end on the Mac with a real MIDI keyboard.

**M4 — Ship.** MIDI export opens cleanly in Ableton, calibration flow, accessibility pass (VoiceOver labels on pads/keys/channels, Dynamic Type, Reduce Motion), TestFlight builds for iOS and Mac.
*Accept:* exported `.mid` drops into Ableton at the right tempo and bar alignment.

---

## 7. Open questions for Bart (defaults in brackets)
- Monorepo or separate repo? [`hilma/apps/takt/`]
- Default theme on first launch? [dark]
- Keep computer-keyboard input as a shipping feature on Mac? [yes]
- German count-in on by default? [off]
