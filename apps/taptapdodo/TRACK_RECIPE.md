# TRACK_RECIPE — how a new set gets made

The rule: **genre first, then commit to 4–6 hard musical constraints, then make
the track, chart, and skin all obey the same constraints.** All three are
answers to one question — the genre read. If a decision doesn't trace back to
it, it's wrong.

This is how `minimal` was derived from "make a minimal techno version" and why
`detroit` means swung hats + strings + 122 and `gabber` means distorted kick +
180 + double density. Follow it verbatim for new sets.

## The six steps

1. **Start from what the genre IS, not from an existing track.** Write the
   read in one line first (minimal techno: hypnotic repetition, subtraction
   over addition, groove carried by the kick, no melody). The first decision
   is usually destructive — e.g. throwing away the melody entirely — and it
   drives everything else.

2. **Genre → fixed musical parameters.** BPM in the canonical range. Kick
   pattern. Harmonic content (minimal got ONE note — an A1 drone with a slow
   filter sweep — for the whole track). Percussion vocabulary and where it
   sits (offbeat hats, claps on 2 & 4, sub rumble glued to the kick).
   → Code: `TrackDef` (bpm, swing, bars) in `Charts/TrackDefs.swift`; the
   arrangement in `Audio/BackingComposer.swift`; patches in `Audio/Voices/`.

3. **Reinterpret the game mechanic to match.** Player taps must BE part of the
   music. Melodic genre → taps play the lead line (pitchIndex → scale tones).
   No melody → lanes become drum voices, chosen in different frequency bands
   so three simultaneous hits don't smear (sub blip / rimshot / metallic tick).
   → Code: the lane-voice switch in `GameScene.handleTap` + a voice struct per
   lane sound; `melodic` + `scaleTones` on the TrackDef.

4. **Structure = an arrangement arc as bar ranges.** ~32 bars:
   intro → groove → build → breakdown → peak → outro. Elements enter on
   section boundaries (hats at bar 4, claps at bar 12). The breakdown is the
   emotional payoff — it exists so the drop lands.
   → Code: `sections` on the TrackDef; the composer keys off the same bar
   ranges; `BackingPlan.dropTime` drives the kick haptics.

5. **Chart = the same section logic.** ~5 short eighth-note patterns as
   [offset, lane] pairs, one per intensity level, assigned to sections.
   Density tracks the arrangement: sparse in intro/breakdown, dense at peak.
   Placement follows the music's rhythmic logic — offbeats in the intro if
   that's where the clicks are, lane 0 anchoring downbeats because it's the
   anchor voice.
   → Code: `patternBank` on the TrackDef. The generator's mutations and
   playability constraints (`Charts/ChartGenerator.swift`) apply on top; don't
   fight them, feed them good patterns.

6. **Skin follows the sound.** Monochrome + strobe + shapes + lowercase mono +
   "locked/drift" all came from the same genre read that produced the drone.
   Pick background, lane style (colors vs glyphs), beat FX, type, judgment
   vocabulary, flavor lines, and the dodo's combo flourish as one voice.
   → Code: one file in `Skins/`, a `DodoStyle` case, flourish in
   `DodoNode.update`.

## Checklist for a new set

- [ ] One-line genre read written down before anything else
- [ ] 4–6 hard constraints committed (BPM, kick, harmony, percussion, density)
- [ ] Lane voices: what does a tap MEAN in this genre, and do the three lanes
      stay spectrally separated?
- [ ] Sections as bar ranges, entrances on boundaries, breakdown → drop
- [ ] Pattern bank per section, density tracking the arc
- [ ] Skin + judgments + flavor + dodo flourish from the same read
- [ ] Every choice traces back to the genre line — audio, chart, and visuals
      answering one question
