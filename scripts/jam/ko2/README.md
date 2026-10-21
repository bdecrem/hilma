# Jambot → KO II (Teenage Engineering EP-133 K.O. II)

Bart's Jambot kit on the KO II's pads, built 2026-10-20. Three scripts, in order:

1. `node scripts/jam/ko2/render-kit.mjs` — renders 44 one-shots from the Minimal 130
   session (his tuned-down 909, the JB202 sub and stabs, the JT10 line with its delay
   and room printed in, the JT30 acid patch at three filter openings) into
   `out/kit/*.wav` + `kit.json` (group, pad, note, root per sound). Proven patch
   values only; each shot normalized to -3 dBFS, the KO II's own pad amplitude does
   the mix. Synth shots render at 65 BPM so a 16th-note gate is a real note.
2. `EPSYSEX=<clone> python3 scripts/jam/ko2/upload-kit.py --project 9 --first-slot 560 --activate`
   — uploads every WAV (46875 Hz s16, mono; the lead stereo) to free slots over SysEx
   with the kmorrill `ep-series-sysex` toolkit (https://github.com/kmorrill/ep-series-sysex,
   `pip install -e ".[device]"` in a venv), byte-verifies each, then assigns the pads of
   one project through pad metadata (`sym`), the same path the device's own UI uses.
   No project TAR is written. Resumable; refuses occupied slots and non-empty projects.
3. `python3 scripts/jam/ko2/play-ko2.py --bars 16` — the Mac sequences the KO II over
   USB MIDI with that kit (notes 36 + group×12 + pad offset), building up the Minimal
   130 groove bar by bar. Press REC on the KO II and it records the performance.

Pad layout (archive pNN numbering; p10 = ".", p11 = "0", p12 = "enter", p07–p09 = 1 2 3,
p04–p06 = 4 5 6, p01–p03 = 7 8 9): A = drums (kick on "."), B = sub on the bottom row,
stabs above, C = JT10 notes, D = acid.

State on Bart's unit after 2026-10-20: slots 560–603, project 9, **OS 2.5.1** (it was on 1.1.1;
`update-os.mjs` drove the official browser updater headlessly). On 2.5.1 everything the toolkit
documents works: project TAR reads (`read_project.py`, refused with `invalid id` on 1.1.1), pad
metadata, and the KO II is a USB audio device on the Mac, so a check can capture its own output:
`sox -t coreaudio "EP-133" -r 48000 -c 2 -b 16 out.wav trim 0 20` while `play-ko2.py` runs (the shell
has no microphone permission, but the EP-133 input works; ffmpeg's avfoundation capture of it drops
samples and comes out 18% short, sox keeps real time). Verified that way: 12 kicks sent on the beat
over MIDI come back as 12 peaks, 460–465 ms apart once the capture settles (grid 461.5). A recording
of the groove is `~/Desktop/ko2/ko2-plays-jambot-kit-2026-10-20.wav`. Backups of all nine projects from that day are in
`~/Desktop/ko2/backup-2026-10-20/`. A sample-metadata write over ~165 bytes of JSON is refused with
`invalid length`, so keep names short.
