# Takt sound licenses

Every sound Takt plays is our own. No third-party samples, sample packs or sound banks are bundled.

| Sound | Source | License |
|---|---|---|
| Drums: `kick`, `snare`, `rimshot`, `ch`, `oh`, `ride` (`Takt/Sounds/*.wav`) | Rendered by Jambot (Bart's own engine, `vibeceo/jambot`, JT90 drum voices) from the Minimal 130 session patches, via `apps/ko2/tools/render-kit.mjs`, 2026-10-20 | Own work |
| Bass: `sub-G1`, `sub-A1`, `sub-C2` | Same render: Jambot JB202 sub | Own work |
| Rhodes (monitor and KEYS channel) | Synthesized in the app, `Takt/Audio/Voices.swift` (`FMPatch.rhodes`) | Own code |
| Horns | Synthesized in the app, `Takt/Audio/Voices.swift` (`FMPatch.brass`) | Own code |
| Band patterns (`Takt/Content/band-*.json`) | Written by `apps/takt/scripts/band.py` | Own work |

Adding a sound: record its source and license here in the same commit. CC0 or our own only.
