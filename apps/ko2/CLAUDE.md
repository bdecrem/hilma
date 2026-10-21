# KO II — Bart's Teenage Engineering EP-133 K.O. II

Bart's sampler, on the iMac over USB-C. This folder is the project for everything that touches it:
the manual, the Jambot kit that lives on it, the SysEx and MIDI tools, and the OS updater.

## Answering questions about the device — read the manual first

**Any question about operating the KO II ("how do I mute the lead", "how do I chop a sample",
"what does 511 do") is answered from `manual/ep-133-guide.md`, the official guide as text.**
Grep it for the term, read the section, answer with the button combo in the guide's words, and
name the section number. Don't answer from memory: the guide is 100 KB of short sections and the
combos are easy to misremember. The guide's own conventions: (SHIFT), (FX), (MAIN), (SOUND),
(ERASE), (RECORD), (PLAY), (FADER), (minus)/(plus), (knobX)/(knobY), group pads (GROUPA)–(GROUPD),
the 12 pads double as a numpad. Hold means hold, press means press.

- `manual/ep-133-guide.md` — the guide at OS 2.5 (what's new, hardware, modes, play and record,
  functions, effects, how-to, system settings with their codes, MIDI implementation, error codes).
  Rebuild it after an OS release with `python3 apps/ko2/manual/fetch-guide.py`.
- `manual/sysex/` — the ep-series-sysex toolkit's protocol docs (MIT, kmorrill): the SysEx
  framing, the FILE protocol (fids, metadata, sounds, project TARs), the project archive format,
  the MIDI reference, the error strings, the hardware test log. For anything we do over USB.

### Cheat sheet (from the guide; check it before trusting these)

- **Speaker / master volume:** the big third knob at the top right by the speaker (the two small
  knobs are X and Y). The guide never names it; GearNews' review and manuals.plus do. Plugging
  anything into the output jack cuts the built-in speaker. Whether the USB audio level follows the
  knob is untested as of 2026-10-20.
- **Hear the KO II on the iMac's speakers:** `apps/ko2/tools/monitor.sh --bg` pipes its USB audio
  input to the Mac's default output with sox (stop: `pkill -f 'coreaudio EP-133'`). Buffer 8192:
  2048 dropped data. Bart asked for this on 2026-10-20 and it worked.
- **Mute / solo a group:** the KO II has no mute key. While playing, hold (FX) and press a group
  pad to solo it (several group pads = solo several). To take a group out, hold its group pad and
  pull the FADER down: that is the group's project volume, not automated. Or set the fader to LEVEL
  for that group (hold (FADER) + the LEVEL pad) and ride it, which the pattern records if (RECORD) is
  held. Section 11 effects (solo), 9.4 fader.
- **System settings:** (SHIFT)+(ERASE), then (minus)/(plus) and ENTER to walk the tree, (SHIFT)+ENTER
  goes back, or type the code on the pads and ENTER. 100–102 MIDI clock off/in/out, 110–127 MIDI
  channel, 301 pad velocity on, 510/511 USB audio input sampler-only / sampler + monitoring.
  The full table is in the guide's "system" chapter.
- **Change project:** hold (MAIN) and press pad 1–9. **Scene:** hold (MAIN) + (minus)/(plus) or type
  the number. **Pattern:** hold a group pad + (minus)/(plus) or type the number. **Commit** (save the
  scene and start the next from it): (SHIFT)+(MAIN). **Undo:** (SHIFT)+(GROUPB).
- **Record:** press (RECORD) then (PLAY) for a count-in, play pads; (RECORD)+(PLAY) together skips the
  count-in; hold (RECORD) while playing to overdub. **Step sequence** while stopped: (minus)/(plus)
  walks steps, hold (RECORD) + pad records to the step. Pattern length: (RECORD) then (minus)/(plus).
- **Erase:** hold (ERASE) + pad (note), + group pad until PTN (pattern), + (MAIN) 2 s (scene),
  + (SOUND) until SND (deletes the sample from memory, permanent), + (FADER) (fader automation).
- **Sound mode:** (SOUND), pick a group and pad, (minus)/(plus) changes the sample on the pad,
  hold (SOUND) + number types a slot, (knobX) amplitude, (knobY) pitch. Factory slots: kicks 1–99,
  snares 100–199, hats 200–299, percussion 300–399.
- **Effects:** (FX) while playing, (minus)/(plus) picks delay/reverb/distortion/chorus/filter/
  compressor, the FADER sets the send for the current group, (knobX)/(knobY) the two parameters.
- **Sample:** hold (SAMPLE) and a pad, play the source (mic / line in / USB when SMP > USB is set),
  release. Chop and the sample tool are in the "functions" chapter.

## The unit's state (as of 2026-10-20)

- Serial E3PTU23G, **OS 2.5.1** (updated that day from 1.1.1 by `tools/update-os.mjs`, which drives
  TE's browser updater in headless Google Chrome; Playwright's own Chromium crashes on that page).
- **Project 9 is the Jambot kit**: 44 one-shots from Minimal 130 in sample slots 560–603, on the 48
  pads via pad metadata (no project TAR write). A = drums (kick on ".", rim "0", snare ENTER, closed
  hat 1, open hat 2, ride 3, toms 4 5 6, clap 7, crash 8), B = JB202 sub on . 0 ENTER and the stabs,
  C = JT10 lead notes, D = JT30 acid shots. Layout and MIDI notes in `README.md` and
  `out/kit/kit.json` (gitignored; re-render with `tools/render-kit.mjs`). P9 is the active project.
  P1–P5 hold Bart's and the factory projects, P6–P8 are empty.
- Backups of all nine project TARs: `~/Desktop/ko2/backup-2026-10-20/`. A capture of the KO II
  playing the groove: `~/Desktop/ko2/ko2-plays-jambot-kit-2026-10-20.wav`.
- On the Mac it is CoreMIDI device "EP-133" (both directions) and, since 2.5, a USB audio device
  "EP-133". Record its output with `sox -t coreaudio "EP-133" -r 48000 -c 2 -b 16 out.wav trim 0 20`
  (real time; ffmpeg's avfoundation capture drops ~18 % of the samples). The shell has no microphone
  permission but that input works.

## Tools

Run `./setup.sh` once per machine: it makes `.venv/` (mido, python-rtmidi) and clones the
ep-series-sysex toolkit into `ext/` (both gitignored). Always use `.venv/bin/python3`.

| Tool | What |
|------|------|
| `tools/render-kit.mjs` | Renders the 44 one-shots from `scripts/jam/songs/techno-128-base.json` with Minimal 130's proven patches (jambot from `../vibeceo/jambot`) into `out/kit/` + `kit.json`. Solo one instrument, 1 bar, trim, normalize to −3 dBFS. |
| `tools/upload-kit.py` | Uploads the kit to sample slots and assigns the pads of a project over SysEx. `--project N --first-slot N [--activate] [--force] [--skip-upload]`. Resumable; refuses a project with pads already assigned unless `--force`. |
| `tools/play-ko2.py` | Sequences the KO II from the Mac over MIDI: the Minimal 130 groove, `--bars`, `--bpm`, `--clock` (MIDI clock + start/stop). "Let me hear it" = run this. |
| `tools/monitor.sh` | KO II USB audio → the Mac's speakers, live (`--bg` detaches). |
| `tools/update-os.mjs` | TE's OS updater, headless. After the DFU transfer the device reboots and the page never re-detects it; re-run and read the `os_version` console line for the verdict. |

To play the kit for Bart: `apps/ko2/.venv/bin/python3 apps/ko2/tools/play-ko2.py --bars 32 --clock`.
He hears it on the KO II's speaker or headphones, so say so.

## Gotchas (all hit on 2026-10-20)

- One FILE session at a time. Never run two SysEx tools against the device at once.
- A sample-metadata write over ~165 bytes of JSON is refused with `invalid length`: short names
  (≤ 20 ASCII, no prefix), few fields.
- Pad metadata: write `sound.playmode` as a string and pair it with `envelope.release`; `sym` is
  the slot. A status-byte rejection with an ASCII reason is safe; a `33 33` debug frame means
  power-cycle the unit.
- Three pad numberings: the archive's pNN (p10 = ".", p11 = "0", p12 = ENTER, p07–p09 = 1 2 3,
  p04–p06 = 4 5 6, p01–p03 = 7 8 9), the MIDI note (36 + group × 12 + offset, offsets in
  `play-ko2.py`), and what is printed on the pad. Say which one you mean.
- Pads triggered over MIDI send nothing back (thru is off), which is normal.
- No custom firmware exists for the KO II and cross-flashing EP-40 firmware risks the NOR flash;
  the open surface is SysEx. The toolkit docs in `manual/sysex/` are the map.
- `pnpm build` does not touch this folder, but run it before pushing anyway (repo rule).

## Not built yet

Project writer: a Jambot song (patterns, fader automation, scenes) written into a project TAR so the
KO II plays Minimal 130 on its own. Feasible on 2.5.1 (TAR reads work, a backup is the checkpoint),
flagged Extra High. Per-genre kit generator from `library.json`. KO II project → Jambot import.
