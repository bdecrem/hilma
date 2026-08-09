# TAP TAP DODO — iOS Native Design & Build Spec

**Bundle ID:** `com.bartdecrem.taptapdodo`
**Platform:** iOS 17+, iPhone only (portrait locked)
**Stack:** SwiftUI shell + SpriteKit game scene + AVAudioEngine synthesis
**Working name:** Tap Tap Dodo. All music is synthesized on-device — the app ships with zero audio files.

---

## 1. Concept

A three-lane rhythm game starring a dodo. Notes fall from the top of the screen to a hit line; the player taps lanes in time. Every track is synthesized live by the audio engine, and every chart is procedurally generated from a seed — no two runs of a track are identical unless the player replays a seed.

The game ships with multiple "sets" (tracks), each a distinct electronic genre with its own visual skin:

| Set | Name | BPM | Genre | Skin |
|---|---|---|---|---|
| ttd·01 | `origin` | 126 | melodic synth (A minor, plucks) | Club poster: ink navy, pink/amber/teal lanes |
| ttd·02 | `minimal` | 130 | minimal techno, percussive lanes | Monochrome: black/white, shape-coded lanes, strobe |
| ttd·03 | `detroit` | 122 | Detroit strings, swung hats | Deep violet, chrome accents |
| ttd·04 | `gabber` | 180 | distorted kick chaos, unlockable | Blown-out red/black, screen shake |

Sets 01 and 02 are direct ports of the two existing HTML prototypes (reference implementations included in the repo under `/reference/`). Sets 03–04 follow the same architecture with new synth patches and generator parameters.

---

## 2. Architecture

```
TapTapDodo/
├── App/
│   ├── TapTapDodoApp.swift          # @main, routing
│   └── AppState.swift               # ObservableObject: nav, settings, unlocks
├── Screens/                         # SwiftUI
│   ├── TitleScreen.swift
│   ├── SetSelectScreen.swift
│   ├── ResultsScreen.swift
│   └── SettingsScreen.swift         # calibration, haptics, reduced motion
├── Game/                            # SpriteKit
│   ├── GameViewController.swift     # hosts SKView inside SwiftUI (UIViewRepresentable)
│   ├── GameScene.swift              # render loop, note sprites, input
│   ├── Conductor.swift              # THE CLOCK — see §3
│   ├── JudgmentEngine.swift         # hit windows, scoring, combo
│   └── DodoNode.swift               # the mascot, per-skin renderers
├── Audio/
│   ├── SynthEngine.swift            # AVAudioEngine graph + scheduler
│   ├── Voices/                      # one file per instrument
│   │   ├── KickVoice.swift
│   │   ├── HatVoice.swift
│   │   ├── ClapVoice.swift
│   │   ├── BassVoice.swift
│   │   ├── PluckVoice.swift
│   │   ├── PadVoice.swift
│   │   └── StabVoices.swift         # minimal-set lane percussion
│   └── Patches/                     # per-set instrument params (Codable)
├── Charts/
│   ├── ChartGenerator.swift         # seeded procedural charts, §5
│   ├── Chart.swift                  # models: Note, Section, TrackDef
│   └── TrackDefs/                   # one Codable def per set
├── Skins/
│   ├── Skin.swift                   # protocol: colors, glyphs, fonts, fx
│   ├── OriginSkin.swift
│   ├── MinimalSkin.swift
│   └── ...
├── Services/
│   ├── ScoreStore.swift             # local high scores + seeds (SwiftData)
│   ├── Haptics.swift                # CHHapticEngine wrapper
│   └── GameCenterService.swift      # leaderboards (phase 2)
└── reference/
    ├── tap-tap-dodo.html            # web prototype, set 01
    └── tap-tap-dodo-minimal.html    # web prototype, set 02
```

**Key decision: SpriteKit, not pure SwiftUI.** Notes need 60/120fps scroll tied to an audio clock. SwiftUI owns menus/results; SpriteKit owns gameplay. Do not attempt gameplay in SwiftUI — frame pacing will fight you.

---

## 3. The Conductor (timing is the whole game)

One object owns musical time. Everything — audio scheduling, note positions, judgment — derives from it. Never use `Date()`, `CACurrentMediaTime()` alone, or SKAction timing for anything musical.

```swift
final class Conductor {
    let engine: AVAudioEngine
    private(set) var songStartHostTime: UInt64 = 0   // mach host time at beat 0
    var bpm: Double
    var secondsPerBeat: Double { 60.0 / bpm }

    /// Current song time in seconds (negative during count-in)
    var songTime: Double {
        let now = mach_absolute_time()
        return hostTimeToSeconds(now &- songStartHostTime) - leadIn
    }
    func time(ofBeat beat: Double) -> Double { beat * secondsPerBeat }
}
```

- **Audio scheduling:** lookahead scheduler on a background timer (25ms tick, 120ms lookahead). Schedule voices with sample-accurate `AVAudioTime` (`isSampleTimeValid`). Identical pattern to the JS prototypes' `scheduleAudio()`.
- **Render:** `GameScene.update(_:)` reads `conductor.songTime` each frame and positions notes analytically: `y = hitLineY - (noteTime - songTime)/travelTime * laneHeight`. Notes are never animated with SKActions; they are repositioned per frame from the clock. This makes pause/resume and scrubbing trivial and eliminates drift.
- **Input timestamps:** use `UITouch.timestamp` (converted to song time), NOT the frame time at which the touch is processed. This is worth ~1 frame of judgment accuracy and is the difference between "tight" and "floaty."
- **Calibration:** Settings screen has an audio-offset tuner (tap along to a metronome, compute median offset, clamp ±120ms, store per-device). Apply offset in JudgmentEngine only, never to audio.

---

## 4. Audio synthesis

`AVAudioEngine` graph: `voices → per-set mixer → compressor (AVAudioUnitEffect wrapping a dynamics processor) → mainMixer`.

Two implementation options; use **Option A** unless it fights you:

- **Option A — AVAudioSourceNode per voice class.** Each voice type owns a source node with a render block that synthesizes samples for scheduled events (event queue of `(startSampleTime, params)`). Full sample accuracy, no buffers to manage.
- **Option B — pre-render short buffers.** On app launch, render each percussion hit (kick, hat, clap variants) to `AVAudioPCMBuffer` once, then schedule via `AVAudioPlayerNode.scheduleBuffer(at:)`. Simpler; pitched voices (bass, pluck) still need Option A or per-note rendering.

Port the synth patches directly from the prototypes — they are the sound of the game:

**Set 01 `origin`** (from `tap-tap-dodo.html`):
- Kick: sine 150→45Hz exp sweep, 0.22s decay
- Hat: white noise, highpass 7kHz, 50ms closed / 180ms open
- Bass: saw through lowpass sweeping 900→200Hz, one note per beat pattern (A2/F2/C3/G2 progression)
- Pluck (lane notes): square @ note freq through 2.6kHz lowpass, 0.3s decay + triangle octave shimmer
- Pad: detuned saw pair, lowpass 1.1kHz, 4-beat swells every 2 bars
- **Melody mechanic:** the lane note's pluck fires *when the player hits it* (full volume) or as a quiet sine ghost on miss — the player literally plays the lead line. Preserve this exactly.

**Set 02 `minimal`** (from `tap-tap-dodo-minimal.html`):
- Kick: sine 135→38Hz, 0.3s + lowpassed noise rumble tail (110Hz LP, 0.35s)
- Hats offbeat only, entering bar 4; claps (3 stacked noise bursts, bandpass 1.3kHz) on 2 & 4 from bar 12
- Drone: saw A1 (55Hz) through slowly sweeping 90–160Hz lowpass, 16-beat cycles
- Lane stabs (percussive, not melodic): lane 0 = sine sub blip 220→110Hz; lane 1 = square rimshot through bandpass 1.8kHz Q6; lane 2 = dual-square metallic tick, highpass 2.5kHz
- Structure: intro (offbeats only) → groove → layered → **breakdown bars 16–20 (kick out, sub notes only)** → peak → outro

**Set 03 `detroit`:** add a string patch (3 detuned saws, slow attack, chorus via slight delay), swing the hats (55–58% swing on eighths), 122 BPM, minor 9th chord stabs.

**Set 04 `gabber`:** kick = sine sweep into a waveshaper (tanh distortion, drive 8–12), 180 BPM, chart density ~2× peak, unlocked by S-ranking any other set.

---

## 5. Procedural charts (the expansion)

Charts are generated, not authored. A run is fully determined by `(trackDef, seed)`.

```swift
struct TrackDef: Codable {
    var id: String            // "ttd02"
    var bpm: Double
    var bars: Int             // 28–36
    var sections: [Section]   // intro/groove/build/breakdown/peak/outro with bar ranges
    var laneVoices: LaneVoiceMap
    var densityCurve: [Double]      // notes-per-bar target per section
    var patternBank: [Pattern]      // eighth-note motifs, as in the prototypes
    var swing: Double               // 0.5 = straight
}

struct Note: Hashable { var beat: Double; var lane: Int; var pitchIndex: Int? }
```

Generator rules (SeededRandomNumberGenerator, e.g. SplitMix64 — never SystemRandom):
1. Walk sections; for each bar, pick a pattern from the section's bank weighted by the density curve.
2. Apply mutations with seeded probability: lane rotation (motif shifts one lane), echo (repeat previous bar's last two notes), rest injection near breakdowns.
3. **Playability constraints (hard):** min gap 0.25 beats same-lane / 0.16 beats cross-lane at ≤130 BPM (scale by BPM); no 3+ consecutive notes forcing full-width lane jumps at high density; first 2 bars always from the sparsest patterns.
4. Musicality: notes on beat 1 of a bar prefer lane 0 (the anchor voice); melodic sets map `pitchIndex` up the scale as sections build.
5. `dailySeed = hash(yyyymmdd)` powers a **Daily Set**: same chart for everyone that day, one leaderboard entry per day.

Persist `(trackId, seed, score)` so any run can be replayed exactly. Results screen shows the seed; tapping it copies a `taptapdodo://play?track=ttd02&seed=...` deep link.

---

## 6. Gameplay rules

- **Lanes:** 3, full-height touch zones split evenly across the screen width (edge-to-edge — do not require hitting the glyph precisely). Multi-touch: judge every touch independently.
- **Travel time:** 1.75s default; scale ±15% with a note-speed setting.
- **Hit windows** (after calibration offset): Perfect ≤ ±65ms, Good ≤ ±140ms, late-miss at +180ms. Set 02 renames judgments: Perfect → `locked`, Miss → `drift`.
- **Scoring:** Perfect 100, Good 50, + `min(combo, 50) × 2` combo bonus. Accuracy = (perfects + 0.5·goods) / total. Grades: S ≥95, A ≥85, B ≥70, C ≥50, else D.
- **Count-in:** ~3.2s, 3-2-1-GO synced to `songTime < 0`.
- **Pause:** interruption-safe. On `AVAudioSession` interruption or backgrounding: stop scheduler, record `songTime`, on resume rebuild `songStartHostTime` so the clock realigns; re-schedule from the current beat. Test with a phone call.
- **Fail state:** none. You always finish the set. (This is a toy with taste, not Dark Souls.)

---

## 7. Feel: haptics + juice

Haptics via `CHHapticEngine`, pre-created patterns:
- Perfect/locked: sharp transient, intensity 0.8, sharpness 0.9
- Good: intensity 0.5
- Miss/drift: nothing (absence reads as failure)
- Downbeat kick during breakdown→drop transition: soft transient, intensity 0.3 — the phone thumps with the kick. Settings toggle: "Kick haptics."

Visual juice per hit: lane glyph flash-expand (0.25s), dodo peck, judgment text 220ms. Screen shake only in gabber set. Respect Reduce Motion: disable strobe, shake, and pulse animations; keep note movement (it's informational).

---

## 8. The dodo

The dodo sits centered below the hit line in every set. It is the brand. Behaviors (all clock-driven, from the prototypes):
- Idle: bob (set 01) or beat-locked head-nod snapping on the kick (set 02+)
- Hit: peck dip toward the hit line, 140–160ms
- Miss: 0.5s sad eyes (set 01) / no reaction, too cool (set 02)
- Combo ≥ 30: set-specific flourish (01: little hop; 02: lowers sunglasses briefly; 03: sways; 04: headbangs)

Rendering: `DodoNode: SKNode` drawing with `SKShapeNode` paths per skin — set 01 filled warm-gray shapes with amber beak/legs; set 02 white 1.5pt line art with filled sunglasses as the only solid shape. Keep it vector; no bitmaps.

---

## 9. Visual system

`Skin` protocol supplies everything the scene and screens need:

```swift
protocol Skin {
    var background: SKColor { get }
    var laneStyle: LaneStyle       // .color([SKColor]) or .glyph([circle,square,triangle], SKColor)
    var displayFont: String        // set 01: Unbounded (bundle it) / set 02: Space Mono
    var judgmentLabels: (perfect: String, good: String, miss: String)
    var beatFX: BeatFX             // .radialGlow(pink) / .strobe(0.05) / .none
    func drawDodo(...) 
}
```

Tokens from the prototypes:
- **origin:** ink `#12101C`, cream `#F5EFE6`, lanes pink `#FF4D8F` / amber `#FFB454` / teal `#3EE6C1`; radial pink glow pulsing from the bottom on the beat; Unbounded 900 for display type.
- **minimal:** black `#050505`, white `#F2F2F0`, gray `#5A5A58`; lanes are shapes (●■▲) not colors; 5%-opacity full-screen strobe on downbeats; Space Mono, all lowercase, tracked-out labels (`ttd·02`, `set complete`, `locked`, `drift`).

Menus follow the currently selected set's skin. Set select is a horizontal pager: big set number, name, BPM, personal best, grade badge.

---

## 10. Screens & flow

```
Title ──▶ Set Select ──▶ Game ──▶ Results ──▶ (again | set select)
   └──▶ Settings (calibration, note speed, haptics, reduce motion)
Daily Set card on Set Select (today's seed, one scored attempt, practice free)
```

Results: grade letter huge, score / max combo / accuracy row, one line of flavor text (port the flavor strings from the prototypes — keep their voice: "metronomic. the booth nods once. highest possible honor."), seed with copy-on-tap, AGAIN button.

---

## 11. Milestones

1. **M1 — Clock & kick.** Conductor + SynthEngine playing set 02's kick/hat/clap loop from the scheduler, sample-accurate. Verify with 10-minute drift test (audible click vs. visual flash).
2. **M2 — Playable minimal.** GameScene with lanes, generated chart (fixed seed), judgment, scoring, HUD, dodo line-art. This is the vertical slice.
3. **M3 — Origin set.** Melodic voices, pitch-mapped charts, origin skin, count-in, results screen, haptics, calibration.
4. **M4 — Generation & daily.** Full ChartGenerator with mutations + constraints, seeds persisted, daily set, deep links.
5. **M5 — Detroit + gabber, unlock logic, Game Center leaderboards (daily + per-set), App Store pass (icon: the dodo in sunglasses, black background).

## 12. Non-goals (v1)

No downloadable songs, no multiplayer, no ads/IAP, no iPad, no landscape, no user-imported audio. The whole point is that it's small, synthesized, and tight.

## 13. Acceptance bar

- Note judgment feels correct to a musician after calibration (test at Perfect window ±65ms).
- Zero audio glitches across 10 consecutive runs; survives phone-call interruption mid-run.
- Cold start to gameplay < 2s.
- 120Hz ProMotion where available; steady 60fps floor on iPhone 12.
- The dodo never stops being the best part.
