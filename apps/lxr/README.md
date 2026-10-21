# LXR-02 Takeover

## Status (kept current)

- **2026-10-20, Phase 0 done, waiting at the gate.** Bart reviews `NOTES.md` and
  `RECOVERY.md` before Phase 1. Nothing has been written to the unit.
- Phase 0 corrected the plan below in six places; `NOTES.md` opens with them. In short:
  the LXR-02 is one STM32F765 (Cortex-M7) with no AVR, so every AVR step is moot; the
  firmware is a plain `LXRV2IMG` file, not `FIRMWARE.BIN`; the port is
  `brendanclarke/LXR02Open`; nothing is signed; Erica's bootloader write-protects itself
  and its updater never erases it; and the official **1.3** package rewrites the
  bootloader and must never go on a card.
- Every image goes through `python3 apps/lxr/tools/check-img.py <file.img>` before it
  goes on a card.
- Folder: this is `apps/lxr/` in hilma (part 2 after `apps/ko2/`), not its own repo.
  `src/` (the three source clones) and `vault/` are git-ignored.

---

The handoff, as written:

# LXR-02 Takeover — Handoff for Claude Code

## Goal

Replace the firmware on my Erica Synths / Sonic Potions **LXR-02** drum synth with our own, built on the open-source LXR codebase, so it becomes a self-contained acid techno instrument:

- **Standalone:** kick, snare, hats, cymbal, an acid bass voice (accent + slide), and a top synth / chord-stab voice. Generative acid line writer, evolving patterns, one "arc" macro for build / breakdown / drop.
- **With laptop:** the laptop (Claude / Jambot) talks to it over USB MIDI to push kits, rewrite patterns and jam back.

**Non-negotiable:** at every stage I must be able to return the unit to the official factory firmware. Safety work comes before any creative work.

---

## Ground rules (read before every session)

1. **Never touch the bootloader.** Do not write, erase or relocate the flash region the bootloader lives in. The SD-card bootloader is our primary recovery path; if it survives, nothing is truly bricked.
2. **Never change STM32 option bytes** (read protection / RDP, write protection, BOR, boot config). Changing RDP from level 1 to 0 triggers a mass erase that wipes the bootloader.
3. **Never change AVR fuses or lock bits.** Read them, record them, leave them alone.
4. **No SWD or ISP writes without my explicit approval in chat.** Reading/dumping is fine once I approve connecting the programmer. Writing is a separate, explicit yes.
5. **One change per flash.** Small, reversible steps. Every flashed image is tagged in git with a version string visible on the LXR's display at boot.
6. **Keep a recovery SD card ready at all times** (see Phase 1). Test it before any custom flash.
7. **Don't redistribute Erica's firmware.** Official binaries and dumps stay in `vault/`, which is git-ignored and never pushed.
8. **If anything looks different from what this doc assumes** (chips, file formats, boot procedure), stop and tell me. This doc contains educated guesses; the hardware is the truth.

---

## What we believe (verify each item in Phase 0)

- Original Sonic Potions LXR firmware is open source: https://github.com/SonicPotions/LXR
- Brendan Clarke's fork: https://github.com/brendanclarke/LXR. He has reportedly ported LXR firmware (v037-based) to the LXR-02; the port was posted in the Elektronauts LXR-02 thread: https://www.elektronauts.com/t/erica-synths-lxr-02-desktop-digital-drum-synthesizer/156287
- The original LXR has two processors: an **STM32F4 (Cortex-M4)** for audio/sound engine and an **AVR (ATmega644)** for the front panel. A `FirmwareImageBuilder` tool combines both into a single `FIRMWARE.BIN` the bootloader accepts.
- The LXR-02 updates firmware from its **microSD card** via a built-in updater. Official firmware (latest known: 1.71, May 2025) is downloadable from Erica: https://www.ericasynths.lv/shop/drum-machines/drum-synthesizer-lxr-02
- USB on the LXR-02 is class-compliant **USB MIDI only** (no USB audio).
- Sound engine is fully digital: 6 voices (Drum 1–3, snare/clap, cymbal, hi-hat), per-voice 2-pole multimode filter incl. a 303-style mode, one shared insert FX slot (drive / ring mod / compressor / delay), no reverb.

---

## Phase 0 — Research and inventory (no hardware changes)

1. Clone SonicPotions/LXR and brendanclarke/LXR into `src/`. Find the LXR-02 port (branch, fork or attachment in the Elektronauts thread). Record exact commit hashes in `NOTES.md`.
2. Read the official LXR-02 manual's firmware update section. Document the **exact** update procedure (file name the updater expects, button combo at power-on, what the screen shows) in `RECOVERY.md`.
3. Download **every** official LXR-02 firmware version Erica still offers, plus the factory SD content, into `vault/official/`. Record SHA-256 hashes.
4. Analyze the official firmware file format:
   - Compare its structure to `FIRMWARE.BIN` produced by `FirmwareImageBuilder` in the open repo (header, AVR section, Cortex section, checksum).
   - Check for encryption or signing (entropy analysis, `binwalk`). If the official image is signed and the bootloader enforces it, **stop and report** — that changes the whole plan.
5. Find out from the source/community: where the bootloader lives in flash, whether the updater can overwrite it (it must not), and whether community members have flashed the port **and successfully flashed back to official firmware**. Summarize evidence with links in `NOTES.md`.
6. Write `RECOVERY.md` (see Phase 2) before moving on.

**Gate:** I review `NOTES.md` and `RECOVERY.md` before Phase 1.

---

## Phase 1 — Backups

Do all of these before any custom firmware goes near the unit.

1. **On the LXR itself:** note the current firmware version from the boot screen / settings. Save all kits, patterns, performances and songs (whatever the LXR-02 offers for full project save).
2. **SD card image:** power off, remove the microSD, and take a full bit-for-bit image on the Mac:
   - `diskutil list` to identify the card (confirm with me before running any command against a disk).
   - `sudo dd if=/dev/rdiskN of=vault/sd-original.img bs=4m` then SHA-256 it.
   - Also copy the card's files normally into `vault/sd-original-files/`.
3. **Recovery SD card:** prepare a **second** microSD card containing the official factory SD content and the current official firmware, laid out exactly as the updater expects. Label it physically: "LXR RECOVERY". Never write custom firmware to this card.
4. **Optional, deeper backup (needs my approval and opening the case):**
   - Photograph the boards, read chip markings, confirm MCU part numbers. Look for SWD pads (SWDIO, SWCLK, GND, 3V3, NRST) for the STM32 and ISP pads (MISO, MOSI, SCK, RST) for the AVR.
   - STM32 via ST-Link, **read only**: check RDP level (`st-info --probe` / STM32CubeProgrammer). If RDP is 0, dump the entire flash to `vault/stm32-full.bin`. If RDP is 1, **do not change it**; record that a full dump is impossible and that the bootloader is our only recovery path.
   - AVR via ISP programmer, **read only**: `avrdude` read flash, EEPROM, fuses and lock bits into `vault/avr-*`. If locked, record that and move on.
   - A full STM32 dump + AVR dump is what turns "probably recoverable" into "always recoverable," even if the bootloader dies.

**Gate:** I confirm the recovery card exists and the backups are hashed.

---

## Phase 2 — Recovery drill (before any custom code)

Prove the way back works while everything is still stock.

1. Use the LXR RECOVERY card to re-flash the **current official firmware** over itself using the official procedure.
2. Confirm the unit boots, shows the right version, and plays.
3. Write the tested procedure into `RECOVERY.md` as numbered steps I can follow without a laptop, at a gig, in the dark:
   - **Tier 1 — Soft recovery:** SD-card updater + official firmware. Covers any bad custom firmware as long as the bootloader is intact.
   - **Tier 2 — Hard recovery:** ST-Link/SWD and ISP programmer restoring the Phase 1 full dumps. Only possible if those dumps exist. Include wiring photos and exact commands.
   - **Tier 3 — Honest note:** if the bootloader is destroyed and no full dump exists, recovery means asking Erica Synths for service. Record their support contact.
4. Include a short "how to tell what state it's in" table: blank screen, stuck on boot logo, boots but no sound, etc. → which tier to try.

**Gate:** I do the drill once myself from `RECOVERY.md` alone.

---

## Phase 3 — Toolchain and a stock-equivalent build

1. Set up on macOS (Apple Silicon): `arm-none-eabi-gcc` (ARM GNU Toolchain), `avr-gcc` + `avr-libc`, `make`. Prefer Homebrew; document versions in `NOTES.md`.
2. Build the LXR-02 port unchanged. Get `make firmware` producing a firmware image.
3. Make the boot screen display our version string (e.g. `BD 0.0.1`) — the only change.
4. Verify the image format matches what the official updater expects (Phase 0 analysis).

**Gate:** I approve the first custom flash.

---

## Phase 4 — First flash and round trip

1. Write the custom image to a **separate** SD card (never the recovery card).
2. Flash it. Confirm the version string appears and all 6 voices, sequencer, MIDI and SD save/load work.
3. **Immediately flash back to official firmware** with the recovery card. Confirm it works.
4. Flash custom again. Now we've proven the full round trip.

---

## Phase 5 — First audible mod

Small and obvious, to prove the edit → build → flash → hear loop:

- Add a new waveform (e.g. a band-limited saw or square) to Drum 2's oscillator options, or change its FM ratio range.
- Add a CPU meter: measure the audio callback with the Cortex-M4 DWT cycle counter and show peak load % on a debug page. **We need this number before adding heavier voices.**

---

## Phase 6 — The instrument

Each item is its own branch, flash and test. Re-check the CPU meter after every one. Keep the audio callback comfortably under budget (target < 80% peak).

1. **Acid voice (Drum 2):** saw/square oscillator into the existing 303-style filter, with per-step **accent** (boost to amp and filter envelope) and **slide** (portamento to the next step's note, legato envelope). Notes in key, per-step pitch.
2. **Top synth / chord voice (Drum 3):** mono lead mode, plus a chord-stab mode playing 3–4 oscillators in a fixed chord shape (minor 7, minor 9, etc.) from a single trigger.
3. **Acid line writer:** a button that generates a 16/32-step line for the acid voice in the current key and scale, with sensible accent/slide density. Re-roll and keep. Store with the pattern.
4. **Evolving patterns:** per-step probability and slow mutation over N bars, with a "freeze" control.
5. **Arc macro:** one control that moves the whole kit through build → breakdown → drop by morphing filter cutoffs, mutes, hat density and FX send.
6. **FX bus:** run drive and delay at the same time instead of one insert slot. Investigate a short, cheap room/plate reverb within available RAM; report memory use before committing.

Layout target: Drum 1 = kick, Drum 2 = acid bass, Drum 3 = lead/chords, snare (or clap), hi-hat (open/closed choke), cymbal.

---

## Phase 7 — Laptop mode

1. Define a small, documented MIDI SysEx protocol (`PROTOCOL.md`): load kit, write pattern, set voice parameter, request current state.
2. Write a companion script on the Mac (Python or Node) that can push a pattern to the LXR and read its state back.
3. Leave room for Jambot / Claude to drive that script later. The LXR must work exactly the same with no laptop connected.

---

## Phase 8 — Stretch

- USB audio (class-compliant, stereo or 4-channel at 48kHz). Only if CPU and timing allow. Big job; propose a design first.

---

## Repo layout

```
lxr-takeover/
  README.md        this plan, kept current
  RECOVERY.md      tested, step-by-step factory restore
  NOTES.md         findings, links, commit hashes, tool versions, CPU numbers
  PROTOCOL.md      laptop SysEx protocol (Phase 7)
  src/             forked firmware (our branch on top of the LXR-02 port)
  vault/           git-ignored: official firmware, SD images, dumps, hashes
  tools/           scripts: build, write-sd, hash, flash-checklist
```

## Hardware to have on hand

- 2–3 spare microSD cards + a card reader (one is the permanent LXR RECOVERY card)
- Only for Tier 2 recovery: an ST-Link (V2 or V3), an AVR ISP programmer (e.g. USBasp), jumper wires, a multimeter, small screwdrivers

## How to report back to me

At each gate: what you did, what you found, anything that contradicts this doc, and the exact next step you want approval for. Keep it short.
