# Takt sound licenses

Every sound Takt plays is a recording under a permissive license, cut by
`apps/takt/scripts/sounds.py` from the sets `scripts/sounds-fetch.sh` downloads. No commercial
sample packs.

| Sound | Source | License |
|---|---|---|
| Piano (`pno-*`: the monitor and the KEYS channel) | "Upright Piano, Knight", sampled by Simon Dalzell (Ivy Audio) for VSCO 2; from the Versilian Community Sample Library (VCSL), github.com/sgossner/VCSL | CC0 1.0 |
| Tenor sax (`sax-*`, `saxl-*`: HORNS) | "Tenor Saxophone" (Brett), VCSL | CC0 1.0 |
| Hi-hat foot chick (`hatFoot-*`) | "Hi-Hat Cymbal", VCSL | CC0 1.0 |
| Bass (`bass-*`) | "Finger Bass YR", a Yamaha RBX recorded by Andrea Biasior, FreePats (freepats.zenvoid.org) | CC0 1.0 |
| Drums (`kick`, `snare`, `xstick`, `hat`, `hatOpen`, `ride`, `rideBell`, `crash`, `tomHi`, `tomLo`) | **MuldjordKit by Lars Muldjord** (muldjord.com, drumgizmo.org), FreePats stereo version by Roberto (zenvoid.org) | **CC BY 4.0**: credit required |
| Band patterns (`Takt/Content/band-*.json`) | Written by `apps/takt/scripts/band.py` | Own work |

**Attribution (CC BY 4.0), to show in the app's credits before release:**
"Drums: MuldjordKit by Lars Muldjord, CC BY 4.0 (creativecommons.org/licenses/by/4.0).
Trimmed and re-layered for Takt."

Adding a sound: record its source and license here in the same commit. CC0, CC BY (with the
credit line above), or our own.
