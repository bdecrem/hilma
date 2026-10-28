"""Shared by the Stage song scripts (scripts/songs/*.py → Takt/Content/song-*.json).

A song file is a band (the same shape as band-blues-C.json: `scripts/band.py`) plus a `song`
block: title, style, key, tempo, the cover's glyph, the sections by bar, and the two parts the
player can take, each the whole part as the record plays it. Every note carries a weight
(`lv`: 1 the hits the part stands on, 2 the ones that make it groove, 3 the pushes and
ornaments) and every chord note its role in the chord (`r`: root, third, fifth, ...); the app
cuts each level's chart from those by the rules in Takt/Content/charting.json (CHARTING.md).
The band's own channel for a part (keys for the chords, horns for the melody) is the whole
part, so the record plays it in full when you take the other one.

Time: 12 ticks a beat, 48 a bar; `t` is the tick in the whole song. Notes are MIDI, C4 = 60.
"""
import json
import random
from pathlib import Path

CONTENT = Path(__file__).resolve().parent.parent.parent / "Takt/Content"
TPB, BAR = 12, 48

# A chord note's role, what charting.json's `keep` orders.
ROLES = ("root", "third", "fifth", "sixth", "seventh", "ninth")

NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]


def midi(name, octave):
    """midi("Eb", 4) → 63."""
    return 12 * (octave + 1) + NOTE_NAMES.index(name)


class Song:
    def __init__(self, name, title, style, key, tempo, art, line, seed=1):
        self.name = name
        self.title, self.style, self.key, self.tempo, self.art, self.line = title, style, key, tempo, art, line
        # The chord of every bar (the game's chord label); a silent tail bar is added on write.
        self.chords = []
        self.rng = random.Random(seed)
        self.sounds = {}
        self.instruments = {}
        # Pitched channels' levels in dB (bass, keys, horns), the way sounds carry gainDb.
        self.levels = {}
        # Sidechain: {"depth", "release", "channels"}; every kick ducks those channels.
        self.duck = None
        # The dub send (Takt/Audio/DubChamber.swift): {"sends": {channel: level}, "beats", ...}.
        self.dub = None
        self.drums = []
        self.bass = []
        self.keys = []
        self.horns = []
        self.sections = []
        self.parts = {}
        self.bars = 0

    # MARK: Events

    def hum(self, v, spread=0.05):
        return round(min(1.0, max(0.05, v + self.rng.uniform(-spread, spread))), 3)

    def hit(self, t, s, v, spread=0.05):
        self.drums.append({"t": t, "s": s, "v": self.hum(v, spread)})

    def note(self, ch, t, n, v, ln, inst=None):
        e = {"t": t, "n": n, "v": self.hum(v, 0.04), "len": ln}
        if inst:
            e["i"] = inst
        ch.append(e)

    def chord(self, ch, t, notes, v, ln, inst=None):
        for n in notes:
            self.note(ch, t, n, v, ln, inst)

    def section(self, bar, name):
        self.sections.append({"bar": bar, "name": name})

    # MARK: Parts

    def part(self, key, title, monitor, channel, instrument):
        """A part the player can take: `channel` is the band channel it replaces (keys or
        horns), `monitor` the instrument their keys play, `instrument` the band's for it."""
        p = {"title": title, "monitor": monitor, "channel": channel, "notes": []}
        self.parts[key] = p
        self.instruments[channel] = instrument
        return p["notes"]

    @staticmethod
    def pnote(notes, t, n, ln, lv, finger=None, role=None):
        e = {"t": t, "n": n, "len": ln, "lv": lv}
        if finger:
            e["f"] = finger
        if role:
            assert role in ROLES, role
            e["r"] = role
        notes.append(e)

    @staticmethod
    def pchord(notes, t, voicing, hit_lv, ln):
        """A chord hit of weight `hit_lv`: `voicing` is [(note, role, finger)]."""
        for n, role, f in voicing:
            Song.pnote(notes, t, n, ln, hit_lv, f, role)

    @staticmethod
    def fingered(notes, right=True):
        """Right-hand fingers for a melody chart that has none, the same finger for the same
        note all song: the chart's lowest note under the thumb, a finger further for every
        two-and-a-bit semitones up to the pinky, and a new position (thumb again) every
        octave. The left hand mirrors it (the pinky low)."""
        if not notes:
            return
        low = min(e["n"] for e in notes)
        for e in notes:
            if e.get("f"):
                continue
            d = (e["n"] - low) % 12
            f = min(5, 1 + int(d / 2.4 + 0.5))
            e["f"] = f if right else 6 - f

    def chart_to_channel(self, notes, ch, v, spread=0.05, inst=None):
        """The hard chart as the band's channel events (levels 1–3 all play)."""
        for e in sorted(notes, key=lambda e: (e["t"], e["n"])):
            self.note(ch, e["t"], e["n"], v(e) if callable(v) else v, e["len"], inst)

    # MARK: Write

    def write(self):
        assert len(self.chords) == self.bars, "a chord for every bar"
        end = self.bars * BAR
        # The whole song is one "chorus" of the form, plus a tail bar the game ends in, so the
        # band never wraps to the top before the last chord has rung out.
        form = self.chords + ["—"]
        self.bars += 1
        for ch in (self.drums, self.bass, self.keys, self.horns):
            ch.sort(key=lambda e: e["t"])
            assert all(0 <= e["t"] < end for e in ch), "an event past the end"
        for p in self.parts.values():
            p["notes"].sort(key=lambda e: (e["t"], e["n"]))
            assert all(0 <= e["t"] < end for e in p["notes"])
            assert all(e["lv"] in (1, 2, 3) for e in p["notes"])
        assert all("r" in e for e in self.parts["chords"]["notes"]), "a role for every chord note"
        band = {
            "name": self.name,
            "ticksPerBeat": TPB,
            "beatsPerBar": 4,
            "bars": self.bars,
            "form": form,
            "sounds": self.sounds,
            "instruments": self.instruments,
            "levels": self.levels,
            "duck": self.duck,
            "dub": self.dub,
            "channels": {"drums": self.drums, "bass": self.bass, "keys": self.keys, "horns": self.horns},
            "song": {
                "title": self.title,
                "style": self.style,
                "key": self.key,
                "tempo": self.tempo,
                "art": self.art,
                "line": self.line,
                "sections": self.sections,
                "parts": self.parts,
            },
        }
        out = CONTENT / f"{self.name}.json"
        out.write_text(json.dumps(band, indent=None, separators=(",", ":")).replace("},{", "},\n{") + "\n")
        self.bars -= 1
        n = {k: len(v["notes"]) for k, v in self.parts.items()}
        print(f"{out.name}: {self.bars} bars at {self.tempo}, {len(self.drums)} hits, "
              f"{len(self.bass)}/{len(self.keys)}/{len(self.horns)} bass/keys/horns notes, parts {n}, "
              f"{self.bars * 4 * 60 / self.tempo:.0f} s")
