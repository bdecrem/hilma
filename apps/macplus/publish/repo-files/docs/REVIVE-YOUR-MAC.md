# Bring your vintage Mac back to life

This is the on-ramp: get a real 68k compact Mac (Plus, SE, Classic, SE/30…)
booting, storing files, and talking to a modern Mac — the foundation everything
else here builds on. None of it requires opening the machine or soldering.

## 1. Give it a disk it can actually boot: BlueSCSI

Old Macs boot from SCSI hard drives that are, by now, usually dead. A
[**BlueSCSI**](https://bluescsi.com/) replaces the drive with a microSD card: it
plugs into the Mac's SCSI port and pretends to be one or more hard disks by
reading disk-image files (`.hda`) off the card.

1. Get a BlueSCSI (v2 internal or external) for your machine's SCSI connector.
2. Format a microSD card as FAT32/exFAT.
3. Put a bootable disk image on it — a System 6.0.8 or 7.0.1 HFS image with the
   System Folder blessed. The BlueSCSI wiki and the vintage-Mac community have
   ready-made images; name it so BlueSCSI mounts it as a hard disk (see the
   BlueSCSI docs for the `.hda` / `bluescsi.ini` conventions).
4. Insert the card, power on. You should boot to the desktop.

> **A note on ROMs and System software.** The Mac ROM and Apple's System
> software are copyrighted and are **not** included in this project. Use a ROM
> and System you're entitled to. The Macintosh Garden and the BlueSCSI community
> are the usual starting points.

## 2. Get it online

The compact Mac has no networking of its own. Two common ways to give it one:

- **BlueSCSI DaynaPORT (recommended).** Modern BlueSCSI firmware can emulate a
  *DaynaPORT SCSI/Link* network card. With the DaynaPORT driver + **MacTCP**
  installed in the System Folder, your Mac gets a real TCP/IP stack over the
  same BlueSCSI. This is what the apps here use by default (`net/nettcp.c`).
- **A serial-to-WiFi modem** (e.g. a *RetroWiFi*, or any ESP8266 "WiFi modem").
  It plugs into the modem/printer serial port and speaks the Hayes `AT` command
  set; the Mac "dials" a TCP host as if placing a phone call. See `wifi/` for a
  bring-up test app, and `serialdoc/` to diagnose a flaky serial cable.

Either way, the goal is the same: the old Mac can open a TCP connection to
another machine on your LAN.

## 3. Point it at a modern Mac (the "brains")

The apps in this project are thin clients. The real work happens in the
**agents** — small programs you run on a normal Mac on the same network (see
[RUNNING-THE-BACKEND.md](RUNNING-THE-BACKEND.md)). The old Mac connects to that
machine's IP; that machine fetches web pages, runs the language model, generates
images, and streams back text/bitmaps.

So the full picture is:

```
[ 1986 Macintosh ] --serial or BlueSCSI-network--> [ your modern Mac ]
   native app (this repo)                             agent (this repo)
   renders text + 1-bit bitmaps                       does the heavy lifting
```

## 4. Try it in an emulator first (optional)

You don't need hardware to start. [**Mini vMac**](https://www.gryphel.com/c/minivmac/)
emulates a Mac Plus on your modern Mac and boots a System 6 floppy image with a
real Plus ROM. It's how these apps are visually tested before they touch
hardware — see [BUILDING.md](BUILDING.md). (Note: Mini vMac has no SCSI-network
emulation, so the *networked* apps only run fully on real hardware or over the
serial path; standalone apps like Sudoku run fine in the emulator.)

## Next

- [Install the apps](INSTALL-APPS.md) onto your revived Mac.
- [Run the backend](RUNNING-THE-BACKEND.md) so the apps have something to talk to.
