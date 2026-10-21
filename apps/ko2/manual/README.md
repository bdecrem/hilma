# The KO II's manuals, as text

- `ep-133-guide.md` — teenage engineering's EP-133 K.O. II guide (OS 2.5), every chapter in order with
  the guide's own section numbers, converted by `fetch-guide.py` (run it again after an OS release:
  `python3 apps/ko2/manual/fetch-guide.py`). Images and diagrams are dropped, so a few things the guide
  shows only as pictures (the panel callouts, the fader assignment strip) are not here. The master
  volume knob is not in the guide at all; see `../CLAUDE.md`.
- `sysex/` — the docs of kmorrill's [ep-series-sysex](https://github.com/kmorrill/ep-series-sysex)
  toolkit (MIT, `LICENSE` beside them; clone at commit 891a905, 2026-07-11): the SysEx framing, the
  FILE protocol, the project archive format and its JSON, the MIDI reference, error strings, the
  hardware test log and coverage. The code itself is cloned into `../ext/` by `../setup.sh`.
- Also useful, not copied: Gabriel Roth's unofficial manual, https://gabrielroth.com/ko2/ (a
  shortcut table), and the community tools ep133-ppak (PROTOCOL.md), ep133-export-to-daw,
  ep_133_sample_tool.
