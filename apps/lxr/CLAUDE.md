# LXR-02 — Bart's Erica Synths drum synth, and our firmware for it

Read `README.md` (the plan, its ground rules and the current status), then `NOTES.md`
(what the hardware and the firmware actually are) and `RECOVERY.md` before doing
anything that could reach the unit. The ground rules in README.md are not optional:
bootloader, option bytes and SWD writes are off limits without Bart's explicit yes.

- The unit is on this iMac over USB as MIDI only ("Sonic Potions USB MIDI"). Firmware goes
  in only through the SD card and the updater (hold the encoder at power-on), and that is
  a physical step only Bart can do.
- Never put the official **1.3** package on a card: it rewrites the bootloader.
- Run `python3 apps/lxr/tools/check-img.py <img>` on every image before it goes on a card;
  it refuses images the bootloader won't boot and images that carry the option-byte keys.
- `vault/` holds Erica's binaries and card images. Git-ignored; never commit, push or
  share them (ground rule 7). `src/` holds the source clones, also ignored.
- The port to build on: `src/LXR02Open` (`brendanclarke/LXR02Open`). Its `README.md`,
  `MEMORY.md` and `knowledge_files/` are the deep hardware reference.
