# Macinclaude

**Modern apps for a 1986 Macintosh.** A suite of native applications for real
vintage compact Macs — a Mac Plus, SE, Classic, running System 6 or 7 on a
68000 — that do genuinely modern things by pairing the little Mac with a
"brains" service running on a nearby modern Mac.

Your 40-year-old Macintosh gets: a coding companion powered by Claude, a
web browser, an AI image generator that "develops" pictures like a Polaroid,
a Unix shell, iMessage, and more — all as native black-and-white Toolbox apps,
driving them from the actual 512×342 1-bit screen.

> The vintage Mac has no internet of its own. It talks over its serial port
> (or a BlueSCSI network adapter) to a modern Mac on your LAN that does the
> heavy lifting — fetches web pages, runs the language model, generates images —
> and streams back plain text or 1-bit bitmaps the old machine can render.

---

## The apps

Each app is two halves: a tiny native **Plus app** (C against the classic Mac
Toolbox, built with [Retro68](https://github.com/autc04/Retro68)) and a
**Mac-side agent** (Node/TypeScript) that does the real work.

| App | What it does |
|-----|--------------|
| **Macinclaude Code** (`macinclaude/`) | A Claude coding companion in a VT100 terminal on the Plus. |
| **Surf** (`surf/`) | A reader-mode web browser — the modern Mac fetches + simplifies pages into 1-bit text the Plus renders, with clickable links. |
| **Macinclaude Paint** (`atkinson/`) | Type a prompt → the Mac generates an image, Atkinson-dithers it to 1-bit, and the Plus paints it row by row so it "develops." |
| **Plutonix** (`plutonix/`) | A small Unix subsystem *on the Plus* — a real shell + pipelines + ~18 stream tools, plus `ssh`/`rsh` into your modern Mac. |
| **Foundry** (`foundry/`) | Describe an app in a sentence → the Mac writes it, compiles it with Retro68, and delivers the finished app to your Plus. |
| **The Bridge** (`bridge/`) | Over-the-air app delivery: drop a built app in a folder and it installs itself onto the Plus over the network. |
| **iMessage** (`imessage/`) | Read and reply to messages from the Plus *(personal-integration example — see its note).* |
| **Quote / NetSpeed / Porthole / Sudoku / SerialDoc** | A daily quote, a link speed test, a bitmap viewer, a 36-puzzle Sudoku, and a serial-port diagnostic. |

Plus the shared plumbing: `net/` (a minimal MacTCP client, app-event logging,
full-screen window helper), `tools/` (MacBinary + resource-fork utilities),
and one Mac-side agent per app under `agent-*/`.

---

## Start here

- **[Bring your Mac back to life](docs/REVIVE-YOUR-MAC.md)** — hardware: a
  BlueSCSI, a ROM, a System, and getting the old machine talking to a modern one.
- **[Install the apps](docs/INSTALL-APPS.md)** — put these apps on your Mac,
  via a BlueSCSI SD card or over the Bridge.
- **[Build them yourself](docs/BUILDING.md)** — the Retro68 toolchain and the
  Mini vMac emulator workflow.
- **[Run the backend](docs/RUNNING-THE-BACKEND.md)** — the Mac-side agents that
  give the apps their powers, and how to point the apps at your own machine
  (see also [`config.example`](config.example)).

## Requirements

- A real 68k compact Mac (or the [Mini vMac](https://www.gryphel.com/c/minivmac/)
  emulator) running System 6.0.8 or 7.
- A way to get it online: a [BlueSCSI](https://bluescsi.com/) with a DaynaPORT
  SCSI-network device, **or** a serial-to-WiFi modem (e.g. a RetroWiFi).
- A modern Mac on the same LAN to run the agents (Node 20+).
- To build the apps: the Retro68 cross-compiler.

## A note on your network

The apps ship with a placeholder server address (`192.168.1.50`). Set it to the
LAN IP of the Mac running your agents — in each app's **Settings** dialog, or by
editing the `#define` at the top of the app before building. See
[`config.example`](config.example).

## Credits & license

Built by Bart Decrem with Claude. MIT licensed — see [`LICENSE`](LICENSE).
Retro68, Mini vMac, and the classic Mac ROM/System software are the property of
their respective owners and are **not** included here.
