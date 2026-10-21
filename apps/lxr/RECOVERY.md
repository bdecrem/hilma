# LXR-02 recovery

**Status: DRAFT, NOT YET DRILLED.** Written in Phase 0 from the manual and from reading
Erica's bootloader. Phase 2 tests Tier 1 on the unit; until then, treat each step as
expected, not proven. After the drill, replace this line with the date and what the
screen actually said.

## The two cards

| Label | What is on it | Rule |
|---|---|---|
| **LXR RECOVERY** | The full original SD contents (`PROJ.IDX`, `PROJ00`…), plus `LXRV2_update_v1.71.img` in the root. Nothing else matching `LXR*.img` | Never write custom firmware to it. Never put the 1.3 package on it |
| **LXR CUSTOM** | FAT32, MBR. Our `LXR*.img` in the root, plus its own copy of the kits | The only card a custom image ever goes on |

The card is half the state. A user on Elektronauts recovered a "glo.cfg error" unit by
replacing his card's contents, not his firmware. So recovery = right card + right image.

## Tier 1 — the SD updater (covers every software failure of ours)

Erica's bootloader runs first on every power-up, before any app, and it never erases its
own flash sector. A custom image that hangs, crashes or shows nothing cannot stop it.

1. Power off the LXR (switch off or pull the barrel plug).
2. Take out the card in the slot. Put in **LXR RECOVERY**.
3. **Hold the main encoder pressed** (the big push knob) and power on. Keep holding until
   the screen changes.
4. The screen shows the updater (expected first line: "LXR Updater 2"), then "Checking
   Firmware...", then "Loading Firmware" with a percentage.
5. **Do not power off while the percentage runs.** It takes seconds.
6. "Update OK!" / "Please reboot!": power off, wait two seconds, power on **without**
   holding anything.
7. Check: the version on the boot screen or in settings says 1.71, a project loads,
   PLAY makes sound.

If step 4 shows an error instead:

| Screen | Meaning | Do |
|---|---|---|
| "can't mount" / "SD Card" | Card unreadable | Reseat the card. Try the other card. Reformat a card FAT32/MBR on the Mac and copy the recovery files back |
| "Can't open LXR*.img!" / "Not Found!" | No `LXR*.img` in the root | Put `LXRV2_update_v1.71.img` in the root, not in a folder |
| "Not Valid!" | Wrong file header | The file is not an LXR-02 image. Re-copy 1.71 from the vault |
| "Wrong Size!" | Incomplete copy | Re-copy, eject properly on the Mac |
| "Wrong" / "Checksum!" | Corrupted file | Re-copy; check its SHA-256 against `vault/official.sha256` |
| "Can't erase" / "Flash!" | Flash erase failed | Power-cycle and try once more. If it repeats, stop: Tier 2 |
| "Flash write" / "Error!" | Write failed mid-way | Power-cycle with the encoder held and run it again; the old app is gone, so the updater is the only way forward |
| "Address" / "Error!" | Image too large | Wrong file. Use 1.71 |

## What state is it in?

| You see | Most likely | Try |
|---|---|---|
| Normal boot screen, no sound | App fine, card or settings odd ("glo.cfg error") | Boot with LXR RECOVERY in, no button held. If still silent, Tier 1 |
| "glo.cfg error - using defaults" | Card has globals the firmware does not like | LXR RECOVERY card, no update needed |
| "No Firmware Installed!" | App area empty or not an LXR-02 app | Tier 1 |
| Stuck on the boot logo, or frozen after it | Custom app hung | Tier 1 |
| Blank screen, LEDs off, also with the encoder held | Power, or the bootloader itself is gone | Check the power supply and barrel plug. Then Tier 2 |
| Blank screen, but holding the encoder shows the updater | Only the app is broken | Tier 1 |

## Tier 2 — SWD with an ST-Link (only if the bootloader itself is gone)

Not needed for anything we plan, because our images never touch sector 0 or the option
bytes and `tools/check-img.py` refuses one that could. Kept here so the way back exists.
**Every write in this tier needs Bart's explicit yes in chat first.**

What makes it possible without a dump: Erica's own bootloader is in the 1.3 package
(`vault/official/fw-1.3/unzipped/bootloader.img`, payload linked at 0x08000000), and
1.71 is the app. Payload = the file minus its 16-byte header.

What it needs: an ST-Link V2 or V3, the case open, the SWD pads found (SWDIO = PA13,
SWCLK = PA14, GND, 3V3, NRST), photos of the wiring added here.

Steps (outline; fill in exact commands when the hardware is in hand):

1. Connect, read only: `st-info --probe`. Record the read-protection (RDP) level.
2. **RDP level 2: stop.** SWD is disabled for good; only Erica can repair it (Tier 3).
3. **RDP level 1:** dropping to level 0 mass-erases the whole chip. That is acceptable
   here only because the chip has already lost its bootloader. Bart approves first.
4. Write the bootloader payload at 0x08000000 and the 1.71 payload at 0x08008000. Verify.
5. Power-cycle. The bootloader write-protects sector 0 again on its first boot.

## Tier 3 — Erica Synths service

If the bootloader is gone and SWD is locked or out of reach. Erica Synths, Riga,
Latvia. Support page https://www.ericasynths.lv/support/, email ecom@ericasynths.lv.
Say: LXR-02, bootloader not starting, the firmware history from `NOTES.md`.

## Never

- Put the **1.3 package** (`LXR_V2_V1.3_17_02_2022.img`, `bootloader.img`, `main.img`)
  on any card. It rewrites the bootloader; a power cut during it is the one official way
  to brick the unit.
- Put two files matching `LXR*.img` on one card. The bootloader takes whichever FatFs
  finds first.
- Flash an image that `tools/check-img.py` refuses.
- Power off while the update percentage runs.
