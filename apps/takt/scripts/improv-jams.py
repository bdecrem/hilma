#!/usr/bin/env python3
"""Every jam under a lesson becomes an improv (2026-11-04, IMPROV.md): kind "free", any note,
the band as it was (its channels, its key, its feel), the old riff kept as the step's pattern,
which a free step shows in its intro and plays in Show me as a starting idea, never scores.
Adds the two improv jams the map's Level 1 and Level 2 end on, in the A minor scales, over
Blue Lantern II and Maxwell Street II. Idempotent: run it again and nothing changes.

    python3 apps/takt/scripts/improv-jams.py
"""
import json
from pathlib import Path

CONTENT = Path(__file__).resolve().parent.parent / "Takt/Content"
GOAL = "Improvise two choruses or more. Get notes and one idea back."


def load(name):
    raw = (CONTENT / f"{name}.json").read_text()
    # Each file keeps its own layout: the scales and minor chords files indent by one, the rest by two.
    indent = 1 if raw.startswith('{\n "') else 2
    return json.loads(raw), (raw.endswith("\n"), indent)


def save(name, d, layout):
    newline, indent = layout
    (CONTENT / f"{name}.json").write_text(json.dumps(d, indent=indent, ensure_ascii=False) + ("\n" if newline else ""))


for name in ["lesson-A1", "lesson-S1", "lesson-S1m", "lesson-M", "lesson-H"]:
    d, nl = load(name)
    for s in d["steps"]:
        if s["kind"] == "jam":
            s["kind"] = "free"
    for j in d.get("jams", []):
        if j["goal"] == "Have fun. A clean chorus marks it played.":
            j["goal"] = GOAL
    if name == "lesson-S1m":
        ids = [s["id"] for s in d["steps"]]
        coach = {
            "change": "Get ready. {next} on the 1.",
            "hold": "{chord}. Play what you hear.",
            "clean": "That's a chorus. Keep going.",
            "again": "{problem} Keep going.",
            "join": "From the top.",
        }
        blue = {
            "id": "improv-white", "kind": "free", "title": "Improvise on the white keys", "skill": "rh.improv.white.S1m",
            "tempo": 84, "hand": "right", "feel": "straight", "backing": "song-blue-lantern-white",
            "band": ["drums", "bass", "keys"], "minNotes": 8,
            "form": ["Dm7", "Dm7", "Dm7", "Dm7", "Gm7", "Gm7", "Dm7", "Dm7", "Bb7", "A7", "Dm7", "A7"],
            "chords": {"Dm7": {"numeral": "i", "root": 2}, "Gm7": {"numeral": "iv", "root": 7},
                       "Bb7": {"numeral": "VI", "root": 10}, "A7": {"numeral": "V", "root": 9}},
            # The white keys from D: D E F G A B C.
            "scale": [0, 2, 3, 5, 7, 9, 10],
            "about": "Blue Lantern II's band without its sax: the solo is yours. Play anything on the white keys, the notes of C major and A natural minor, for two choruses or more. Leave space, repeat what you like, land somewhere on beat 1. When you're done, send it: the teacher listens and sends back notes and one idea, made from what you played.",
            "coach": dict(coach, intro="Your solo. White keys only."),
        }
        five = {
            "id": "improv-five", "kind": "free", "title": "Improvise on five notes", "skill": "rh.improv.penta.S1m",
            "tempo": 80, "hand": "right", "feel": "shuffle", "backing": "song-maxwell-street-five",
            "band": ["drums", "bass", "keys"], "minNotes": 8,
            "form": ["A7", "A7", "A7", "A7", "A7", "A7", "A7", "A7", "E7", "D7", "A7", "E7"],
            "chords": {"A7": {"numeral": "I", "root": 9}, "D7": {"numeral": "IV", "root": 2}, "E7": {"numeral": "V", "root": 4}},
            # A minor pentatonic from A: A C D E G.
            "scale": [0, 3, 5, 7, 10],
            "about": "Maxwell Street II's band without its horn: the solo is yours. Play anything on A C D E G for two choruses or more. In the stop time, answer the riff; in the release, ride the shuffle. When you're done, send it: the teacher listens and sends back notes and one idea, made from what you played.",
            "coach": dict(coach, intro="Your solo. A C D E G."),
        }
        for step in (five, blue):
            if step["id"] not in ids:
                d["steps"].append(step)
        jams = {j["step"] for j in d["jams"]}
        if "improv-five" not in jams:
            d["jams"].append({"after": 14, "title": "Improvise on five notes", "skill": "Your solo over Maxwell Street II's band, on A C D E G",
                              "goal": GOAL, "step": "improv-five",
                              "theme": {"glyph": "keys:135", "title": "Five notes, your way", "line": "A C D E G and the band. Play, leave space, play again."}})
        if "improv-white" not in jams:
            d["jams"].append({"after": 15, "title": "Improvise on the white keys", "skill": "Your solo over Blue Lantern II's band, white keys only",
                              "goal": GOAL, "step": "improv-white",
                              "theme": {"glyph": "keys:135", "title": "White keys, your way", "line": "Seven notes and the band. Play, leave space, play again."}})
    save(name, d, nl)
    print(name, sum(1 for s in d["steps"] if s["kind"] == "free"), "improv steps")
