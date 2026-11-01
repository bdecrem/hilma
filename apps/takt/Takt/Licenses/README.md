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
| Organ (`org-*`: your keys when Settings → Sound → Your instrument is Organ; `scripts/organ.py`) | "Percussive organ emulation", a Hammond with percussion through a Leslie rendered from the setBfree tonewheel emulator by the Strix SoundFont Team, FreePats version by Roberto (zenvoid.org), 2019 | CC0 1.0 |
| Rhodes (`rho-*`: your keys when Your instrument is Rhodes; `scripts/rhodes.py`) | **jRhodes3d by Jeff Learman** (github.com/sfzinstruments/jlearman.jRhodes3d), his 1977 Rhodes Mark I Stage 73, recorded from the harp connector | **CC BY-NC 4.0 for distribution in an application**; the author grants commercial licenses on request (jjlearman@gmail.com). Fine for the free TestFlight build; **a license from him is needed before Takt is sold** |
| Guitar (`gtr-*`, `gmute-*`, `gperc-*`: Dockery's guitar, the dead strings and the knocks on its body; `scripts/guitar.py`) | **Shinyguitar by Karoryfer Lecolds / D. Smolken** (github.com/sfzinstruments/karoryfer.shinyguitar), an archtop guitar played acoustic, the microphone samples | CC0 1.0 ("royalty-free for all commercial and non-commercial use") |
| Drums (`kick`, `snare`, `xstick`, `hat`, `hatOpen`, `ride`, `rideBell`, `crash`, `tomHi`, `tomLo`) | **MuldjordKit by Lars Muldjord** (muldjord.com, drumgizmo.org), FreePats stereo version by Roberto (zenvoid.org) | **CC BY 4.0**: credit required |
| Band patterns (`Takt/Content/band-*.json`) | Written by `apps/takt/scripts/band.py` | Own work |

**Attribution (CC BY 4.0), to show in the app's credits before release:**
"Drums: MuldjordKit by Lars Muldjord, CC BY 4.0 (creativecommons.org/licenses/by/4.0).
Trimmed and re-layered for Takt."

**Attribution (CC BY-NC 4.0, the Rhodes):** "Rhodes: jRhodes3 by Jeff Learman, CC BY-NC 4.0."

Adding a sound: record its source and license here in the same commit. CC0, CC BY (with the
credit line above), or our own; the Rhodes is the one exception (NC), taken 2026-11-01 because
no CC0 / CC BY recording of a real Rhodes exists, with the commercial license still to get.
