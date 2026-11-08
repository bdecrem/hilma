# The sound: Takt's instruments, kit, levels and grid

Everything the sampler plays is a recording cut by `apps/takt/scripts/sounds.py` (and the
instrument scripts beside it) from permissively licensed sets, registered in
`apps/takt/Takt/Sounds/instruments.json`; the sources and licenses are
`apps/takt/Takt/Licenses/README.md`. A song file names drum sounds in `sounds` (a kit piece and
a gain) and instruments per channel in `instruments`.

## The instruments (by the name a song file uses)

| name | what it is | notes for writing |
|---|---|---|
| `piano` | the Knight upright (VCSL, CC0), two velocity layers, sampled every other note from G1 | the blues comping and the default **monitor** (the player's keys). Cut at 3.5 / 5 / 7 s, so a held chord sustains by the tail loop |
| `rhodes` | a synthesized one-shot Rhodes (two layers, plate and delay baked in), from the Berlin sketches | the band's keys on Blue Lantern (`keys: rhodes`). Not for the player: `rhodes73` is |
| `rhodes73` | Jeff Learman's 1977 Rhodes Mark I, five layers, long samples (CC BY-NC: a license is needed before Takt is sold) | the player's instrument when Settings says Rhodes. Never a band channel's |
| `organ` | a Hammond 888 000 000 with percussion through a Leslie (setBfree render, CC0), looped | the player's instrument when Settings says Organ. Never a band channel's |
| `bass` | Finger Bass YR, a Yamaha RBX (FreePats, CC0), **sampled E1–D♯2 (MIDI 28–39)** | write bass lines low: roots at 28–40, walks inside 28–50; higher notes are stretched samples |
| `sax` / `saxLong` | Brett's tenor (VCSL, CC0): staccato notes, and the sustained ones | the horn line. Generators set `e["i"] = "saxLong"` on every horns note with `len >= 12` after `chart_to_channel`, so held notes sustain and short ones speak |
| `guitar` / `guitarMute` / `guitarPerc` | Shinyguitar (Karoryfer, CC0): an archtop played acoustic, four layers × two round robins; the dead strings; knocks on the body | the Delta tracks (Dockery, Friars Point): the thumb and the chick, the voice, the slap on the backbeat as a drum sound (`"knock": {"kit": "guitarPerc"}`). Hot velocities are the dirt |
| `eguitar` / `eguitarMute` | Emilyguitar (Karoryfer, CC0), a solid body recorded clean DI | through the engine's amp: a band's `amp` per channel (`Audio/GuitarAmp.swift`). Halsted: `s.amp = {"horns": {"drive": 22, "bias": 0.2, "tight": 130, "mid": 5, "tone": 6000, "presence": 5, "level": -9, "room": 0.22}}` |
| electronic (`kickMin`, `bleep`, `stabMin`, `subDub`, `liveStab`, …) | the Berlin sketches' voices | not for the blues; their songs are `hypnotist.py`, `warm_nine.py`, `abyss.py` |

`instruments` in a song: `{"bass": "bass", "keys": "piano"|"rhodes"|"guitar", "horns": "sax"|"guitar"|"eguitar", "monitor": <what the player's keys play by default>}`.
A part declares its own monitor too (`s.part(key, title, monitor, channel, instrument)`): the
blues hand the player the piano on both parts (Blue Lantern the Rhodes), the Delta tracks the
guitar. Settings can override it with the organ or the Rhodes, so never rely on the monitor's
timbre for the music.

## The kit (MuldjordKit, CC BY 4.0)

Pieces: `kick`, `snare`, `xstick`, `hat`, `hatOpen`, `hatFoot`, `ride`, `rideBell`, `crash`,
`tomHi`, `tomLo`. A song's `sounds` maps a name to a piece and a `gainDb`. **The count-in
needs an `xstick` sound in every song**, even one with no drummer (Dockery lists it for that).

Gains the tracks use (dB), by feel:

| track | kick | snare | xstick | hat | hatOpen | hatFoot | ride | rideBell | crash | tomHi/Lo | `levels` keys / bass / horns |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Slow Burn, Pearl Street, Boogie Shoes (the lesson kit) | −1 | −3 / −4 | −5 | −12 / −13 | −14 / −15 | −12 | −11 | −12 | −12 | −6 / −5 | none (0) |
| Maxwell Street (Chicago, 80) | −2 | −4 | −5 | −13 | −15 | −12 | −11 | −12 | −13 | −6 / −5 | −2 / 0 / −1 |
| Blue Lantern (sixteenth hat, Rhodes) | −5 | −7 | −5 | −19 | −19 | −12 | −11 | −12 | −15 | −6 / −5 | −4 / −5 / −3.5 |
| Halsted (148, guitar through the amp) | −3 | −5 | −8 | −14 | −16 | −15 | −13 | −15 | −13 | −8 / −7 | −5.5 / −1.5 / −1.5 |
| Dockery (one guitar, a foot) | −3 | — | −4 | — | — | −9 | — | — | — | — | +2 / −1 / +2 (knock −6) |

A busy hat (sixteenths) or a sustaining keys instrument wants the kit 4–6 dB down (Blue
Lantern's first mix hit 0 dBFS). `levels` is the pitched channels' trim in dB; the player's
keys take the part's level (`levels["monitor"]` is set by the app from the part).

## Loudness targets

Measured with `scripts/takt/render-song.sh <song>` (ffmpeg `volumedetect` on an offline
render): **the band tracks sit at about −23 dBFS mean with the peak under −1 dB, never
clipping** (Dockery −23.0 / −1.0, Friars Point −22.6 / −1.3, Halsted −22.8 / −3.3, Maxwell
Street −25.0 / −2.7, Blue Lantern −20.7 / −4.0, Pearl Street −21 / −2); the electronic tracks
at −19. Dockery at keys/horns +7 read −19.3 with the peak at −0.8, "too hot against the knee":
when the peak creeps over −1, bring the hands down, not the kick. Set the levels from a
render, never by ear alone.

## The grid

12 ticks a beat, 48 a bar; `t` is the tick in the whole song (`bar * BAR + offset`). The
shuffle's late eighth is **tick 8**, a triplet 4, a straight eighth 6, a sixteenth 3. 12/8 at 90
is written as the shuffle grid (ticks 0 and 8). A straight-eighths song (Blue Lantern) puts the
kick's "and" of 3 on tick 30 and the hat on every 3 ticks. Velocities are 0–1; `Song.note`
humanizes them by `s.human` (0.04) from the song's seed, `s.hit(t, sound, v, spread)` the
drums by `spread` (0.05); set `s.human = 0` only for a reference track that must not move.

`s.write()` adds a silent tail bar after the music (the game ends in it) and asserts: a chord
label for every bar (`s.chords`, the game's label per bar; the form's last entry is the tonic
the song ends on), every event inside the music, every part note weighted 1–3, every chords-
part note with a role. A song is about 2:00–2:30: four choruses of 12 at 90 is 2:08, six at 120
2:24, seven at 148 2:16.

## Where a sound lives

`apps/takt/Takt/Sounds/*.caf`, registered in `instruments.json` by the script that cut it
(`sounds.py` the piano, sax, hat foot, bass and kit; `organ.py`, `rhodes.py`, `guitar.py`,
`eguitar.py`, `synths.py`). `scripts/sounds-fetch.sh` downloads the sets. Adding an instrument
is its own job (a script, a manifest entry, a license row); a track uses what is there unless
Bart asks for a new sound.
