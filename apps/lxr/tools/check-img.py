#!/usr/bin/env python3
"""Check an LXR-02 firmware image before it goes on a card.

The format (from Erica's six official images and LXR02Open's packager):
  8 bytes  magic "LXRV2IMG"
  4 bytes  payload size, little-endian (must equal file size - 16)
  4 bytes  checksum, little-endian: 255 - (sum of payload bytes mod 256)
  payload  a Cortex-M7 app linked at 0x08008000: vector table first

On top of what the bootloader checks (magic, size, checksum), this refuses:
  - a stack pointer the bootloader rejects: it boots the app only when
    SP & 0x2FFE0000 == 0x20080000, else "No Firmware Installed!" (so SP = 0x20080000)
  - a reset vector that is not Thumb code inside the image at 0x08008000
    (Erica's bootloader.img is linked at 0x08000000 and fails here)
  - an image that runs past sector 5 (0x08080000), where LXR02Open keeps samples
  - an image that carries the option-byte unlock keys (OPTKEY1/OPTKEY2): code
    that can rewrite write protection, read protection or the boot address.
    Erica's 1.3 package app has them; it rewrites the bootloader.
It reports, without refusing, an image that carries the flash unlock key:
that code can erase and write flash (LXR02Open does, for samples in sectors 6-11).

Run:  python3 apps/lxr/tools/check-img.py <file.img> [...]
"""
import struct
import sys

APP = 0x08008000
APP_END = 0x08080000          # sectors 1-5; the bootloader owns sector 0 below APP
RAM, RAM_END = 0x20000000, 0x20080000


def check(path):
    d = open(path, "rb").read()
    errs = []
    if d[:8] != b"LXRV2IMG":
        errs.append(f"magic is {d[:8]!r}, not b'LXRV2IMG'")
        return errs, {}
    size, ck = struct.unpack("<II", d[8:16])
    p = d[16:]
    if size != len(p):
        errs.append(f"header size {size} but payload is {len(p)} bytes")
    want = (~sum(p)) & 0xFF
    if ck != want:
        errs.append(f"checksum {ck:#04x}, payload needs {want:#04x}")
    sp, reset = struct.unpack("<II", p[:8])
    if sp & 0x2FFE0000 != 0x20080000 or not (RAM < sp <= RAM_END):
        errs.append(f"stack pointer {sp:#010x}: the bootloader only boots SP 0x20080000")
    if not (APP <= reset - 1 < APP + len(p) and reset & 1):
        errs.append(f"reset vector {reset:#010x} is not a Thumb address inside the image at {APP:#x}")
    if APP + len(p) > APP_END:
        errs.append(f"image ends at {APP + len(p):#x}, past sector 5 ({APP_END:#x})")
    for name, key in (("OPTKEY1", 0x08192A3B), ("OPTKEY2", 0x4C5D6E7F)):
        if struct.pack("<I", key) in p:
            errs.append(f"carries {name}: this code can change the option bytes (never flash it)")
    writes = struct.pack("<I", 0x45670123) in p
    return errs, {"payload": len(p), "checksum": ck, "sp": sp, "reset": reset, "writes": writes}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    bad = 0
    for f in sys.argv[1:]:
        errs, info = check(f)
        if errs:
            bad += 1
            print(f"FAIL {f}")
            for e in errs:
                print("     " + e)
        else:
            print(f"ok   {f}  payload {info['payload']} B, checksum {info['checksum']:#04x}, "
                  f"SP {info['sp']:#x}, reset {info['reset']:#x}"
                  + ("; can write flash" if info["writes"] else ""))
    sys.exit(1 if bad else 0)
