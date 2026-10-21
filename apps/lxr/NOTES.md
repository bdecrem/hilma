# LXR-02 takeover — Phase 0 notes

Research and inventory, 2026-10-20. Nothing was written to the device. The unit was
plugged into the iMac over USB the whole time and only enumerated; no MIDI was sent.

## Read this first: where the handoff was wrong

The handoff said to stop and report anything that differs from its assumptions.
These do, and they change the plan (mostly for the better):

1. **One processor, not two.** The LXR-02 is a single **STM32F765VIH6** (Cortex-M7,
   216 MHz, 2 MB flash, 512 KB RAM). There is no AVR. Everything about AVR fuses, lock
   bits, ISP programmers and `avrdude` is moot.
2. **The firmware format is not the open-source `FIRMWARE.BIN`.** It is `LXRV2IMG`
   (below), one ARM app, no AVR section. `FirmwareImageBuilder` does not apply.
3. **The port exists and is its own repo:** `brendanclarke/LXR02Open`, not a branch of
   `brendanclarke/LXR` (that repo is the original LXR, STM32F407 + AVR, "Catalyst
   Edition", and does not run on the LXR-02).
4. **The image is not signed or encrypted.** Plain code, a one-byte checksum.
5. **Erica's bootloader write-protects itself.** On every boot it turns on flash write
   protection for sector 0 if it is off. The SD updater never erases sector 0.
6. **One official package rewrites the bootloader: 1.3.** It must never go on a card.
   It is the only official way to brick the unit (a power cut while it writes sector 0).

## The hardware (from LXR02Open's bring-up notes, matched against Erica's image)

- MCU STM32F765VIH6 (TFBGA100). Erica's stack pointer is 0x20080000 (512 KB of RAM, which
  no STM32F4 has) and the app is linked at 0x08008000; LXR02Open's linker script is
  `STM32F765VIHx_FLASH.ld` with the same numbers. Reading the chip marking will confirm.
- Flash, single bank: sector 0 (0x08000000–0x08007FFF, 32 KB) = Erica's bootloader;
  sectors 1–5 (to 0x0807FFFF) = the app; sectors 6–11 (0x08080000–0x081FFFFF, 1.5 MB)
  = free on Erica's firmware, LXR02Open's sample storage.
- USB: STM32 OTG_FS behind an ADUM3160 isolator, class-compliant USB MIDI only. On this iMac
  it enumerates as **"Sonic Potions USB MIDI", VID:PID 0483:A0D2, bcdDevice 1.00** —
  the exact descriptor strings and ids in the open-source LXR's `usbd_desc.c`, so
  Erica's firmware is built on Julian Schmidt's codebase.
- SD card: bit-banged SPI (PC12/PD2/PC8/PD0, detect PD1), not SDIO. FatFs in the bootloader.
- Audio: two CS4344 DACs on I2S2/I2S3, 24-bit capable. Display: 2×16 character module,
  4-bit parallel. MIDI DIN on USART3. Main encoder push = PE15.
- Full pin table: `src/LXR02Open/knowledge_files/hardware_archive/HARDWARE_MAP.md`.

## Sources (cloned into `src/`, git-ignored)

| Repo | Commit | Date | What |
|---|---|---|---|
| https://github.com/brendanclarke/LXR02Open | `c896bfd0efe86a4037418bf9f46f1fcc39255958` (branch `prime`) | 2026-05-25 | **The port**: LXR 0.37 on the LXR-02, 26 logged sessions, prebuilt `build/LXRV2_lxr02.img` |
| https://github.com/SonicPotions/LXR | `dee49689f3f0cdf8f9b7b5e79628cfdca1b79394` | 2015-10-23 | Original LXR 0.37 (F407 + AVR) |
| https://github.com/brendanclarke/LXR | `54f3356e8102a65864c7e96f64ca3731d2951c2e` | 2026-10-16 | Catalyst Edition 1.03 for the original LXR. Feature ideas only |

License (all three): Sonic Potions' — redistribution allowed, **no commercial use**, and
a modified binary we hand to anyone must come with its complete source. Personal use is fine.

Related, for later phases: `gregsadetsky/lxr02-editor` (a Web MIDI editor for every
parameter of the official firmware, so its MIDI implementation is mapped there),
`jhw/lxrpy` (Python for the LXR-02 SD card file formats), `sebki/lxr-02`.

## Official firmware (in `vault/official/`, git-ignored, never pushed)

All from https://www.ericasynths.lv/shop/drum-machines/drum-synthesizer-lxr-02/ (Downloads
and Update tabs). SHA-256 of every file: `vault/official.sha256`.

| Version | File | Date | Notes |
|---|---|---|---|
| 1.1 | in the factory SD content zip | 2021-07-05 | Factory SD card: `PROJ.IDX`, `PROJ00`–`PROJ05` (kits `.SND`, patterns `.PAT`, songs `.SNG`, `.CFG`, `.NFO`) |
| 1.2 | `LXR_V2_V1.2_01_09_2021.img` | 2021-09-01 | |
| **1.3** | `LXR_V1.3.zip` = `LXR_V2_V1.3_17_02_2022.img` + `bootloader.img` + `main.img` | 2022-02 | **Bootloader update. Never use.** See below |
| 1.4 | `LXR_V2_V1.4_11_08_2022.img` | 2022-08-11 | |
| 1.6.1 | `LXR_V2_V1.6.1_16_11_2022.img` | 2022-11-16 | |
| 1.70 | `LXRV2_update_v1.70.img` | 2025-04 | Fixed Octatrack MIDI, broke the Euclidean sequencer |
| **1.71** | `LXRV2_update_v1.71.img` | 2025-05-23 | **Latest. The recovery firmware.** SHA-256 `188695ea78cd3da0fb6a3e825732bd7fd365d4491a37126003ec513e163e1576` |

Also: the English manual (2025-09-15, as text in `vault/official/manual.txt`) and the two
Hrtl sound packs.

## The image format

```
offset  size  field
0       8     magic "LXRV2IMG"
8       4     payload size, little-endian (= file size − 16)
12      4     checksum, little-endian: 255 − (sum of payload bytes mod 256)
16      ...   payload: the app, linked at 0x08008000, vector table first
```

Established from all six official app images and identical to LXR02Open's packager
(`tools/build_lxrv2_img.py`). No signature, no encryption: entropy is ~7.0 over the code
and ~8.0 over a 50 KB stretch of what looks like sample/wavetable data, and the vector
table, menu strings ("Save Kit", "Loading Project") and USB strings are all in the clear.
LXR02Open's prebuilt image passes the same checks.

`tools/check-img.py` checks any image against this plus the bootloader's own boot rule
and refuses anything that carries the option-byte unlock keys. Run it on every image
before it goes on a card.

## Erica's bootloader ("LXR Updater 2")

Its code is in the 1.3 package as `bootloader.img` (23,268 bytes linked at 0x08000000,
SHA-256 `9ea6dc57…6c3f9`). I disassembled the parts that matter. What it does, in order:

1. Reads the option bytes. **If flash sector 0 is not write-protected, it turns write
   protection on for sector 0 and sets the brown-out reset to level 1.** It never sets
   read protection (RDP) and never changes the boot address.
2. Reads the main encoder's push (PE15). **Not held → boot the app**: only if the word at
   0x08008000 (the app's stack pointer) masks to 0x20080000, else it shows
   "No Firmware Installed!" and waits. **Held → update mode.**
3. Update mode: mounts the card ("can't mount SD Card"), opens the first file matching
   **`LXR*.img`** in the root ("Can't open LXR*.img! Not Found!"), checks the magic
   ("Not Valid!"), the size ("Wrong Size!") and the checksum ("Wrong Checksum!").
4. Erases **sectors 1–6** (0x08008000–0x080BFFFF), never sector 0 ("Can't erase Flash!").
5. Writes the payload from 0x08008000, refusing to go past offset 0xF7FFE ("Address
   Error!"), showing a percentage. "Update OK! Please reboot!".

What this means:

- The updater cannot overwrite itself, and an app cannot erase it either while sector 0
  is write-protected, unless the app first rewrites the option bytes. **Any image we
  build must never touch the option bytes**, and `check-img.py` refuses one that could.
- A custom app that hangs, crashes or shows nothing cannot lock out the updater: the
  bootloader runs first on every power-up and checks the encoder before it ever jumps.
  So **Tier 1 recovery covers every software failure of ours.**
- The updater erases sector 6, so going back to Erica's firmware wipes LXR02Open's first
  256 KB of sample flash. Harmless; just expected.
- Only one file matching `LXR*.img` should be on a card. Which one wins with two is
  "the first FatFs finds", i.e. directory order, not name or date.

Caveat: this is the bootloader Erica shipped in February 2022. The unit's bootloader is
probably this one or a later one; when you hold the encoder at power-on, the first line
on the screen names it. If it says something other than "LXR Updater 2", tell me.

## The 1.3 package is a bootloader updater

Its update image (`LXR_V2_V1.3_17_02_2022.img`) is not a normal release. It is an app
that unlocks the option bytes (it carries both option-byte keys; no other official app
image has either), reads `bootloader.img` from the card (`BOOTLO~1.IMG`) and rewrites
sector 0 ("Updating Bootloader...", "update 2/3..."), then installs `main.img`. Powering
off during that step leaves a unit with no bootloader. It is in the vault for reference
and for Tier 2 only. `check-img.py` refuses it.

Useful side effect: we have Erica's bootloader binary without opening the case.

## Community evidence

- LXR02Open's README: "You can switch between this and the Erica Synths firmware any time
  with this method" (the SD updater). Brendan did the whole port — 26 sessions of
  hardware bring-up and testing — through SD flashing; no SWD appears anywhere in his notes.
- Elektronauts LXR-02 thread (https://www.elektronauts.com/t/erica-synths-lxr-02-desktop-digital-drum-synthesizer/156287),
  May–June 2026, posts 1524–1541: people tried the port and swapped cards. One user
  (HoojerBob) got "glo.cfg error - using defaults" and hi-hat static after switching back
  and forth, even after reformatting. **His flash was fine; his card was the problem.**
  He recovered by copying a healthy unit's SD contents (1.71) onto his card. Another user
  (mreilly) had firmware corruption and reinstalled it from the card.
- Lesson, and it is the handoff's own plan: **custom firmware gets its own card**, the
  original card is imaged before anything, and the recovery card holds a complete,
  known-good set of SD contents plus 1.71.

## Card format

- LXR02Open needs **FAT32 on an MBR partition table** (FAT16 works; exFAT, FAT12 and GPT
  do not; cards over 32 GB need a ≤32 GB partition). On the Mac:
  `diskutil partitionDisk diskN MBR FAT32 LXR R` (confirm the disk number first).
- Erica's firmware runs from the factory card, so that layout is known to work for it.

## What this iMac has, and what it lacks

- Sees the unit over USB MIDI already. Over USB I can send and receive MIDI and SysEx;
  nothing else. There is no USB disk mode and no USB firmware path: **the bootloader only
  reads the SD card**.
- **No SD card reader** (`system_profiler SPCardReaderDataType` is empty; the M1 iMac has
  no slot). Phase 1 needs a USB microSD reader.
- Toolchain not installed yet (Phase 3): `brew install arm-none-eabi-gcc`. The port only
  needs gcc, make and Python 3; no AVR toolchain at all.
- Disassembly: `capstone` in `apps/lxr/.venv` (git-ignored).

## Open questions for Phase 1 and later

1. Which firmware is on the unit now? The settings or boot screen shows it.
2. Which bootloader? The first line of the screen in update mode.
3. Is read protection on? Unknown, and it decides Tier 2. It can be read without
   opening the case: our first custom build can show the flash option register
   (`FLASH->OPTCR`: RDP level, sector write protection, boot address) on the display.
   Reading it changes nothing. That replaces the case-opening read-only check in
   Phase 1 step 4 for this question.
4. Are there SWD pads, and where? Only matters for Tier 2; needs the case open.
