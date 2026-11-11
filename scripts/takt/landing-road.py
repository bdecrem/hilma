#!/usr/bin/env python3
"""Build what takt.pizza/road needs from the app's own content: the two maps, a clip of each
track with the notes of its two parts, and the venue photos.

    python3 scripts/takt/landing-road.py            # everything
    python3 scripts/takt/landing-road.py --no-render  # reuse the renders in the app's container

Writes src/app/takt/road/data.json, public/takt/audio/<track>.mp3 and public/takt/venues/*.jpg.

Each clip is cut from an offline render of the song through the installed Mac app (the same
render code as the device, `-RenderTo`; quit Takt first, `open` refuses a second one). A clip is
whole bars: a blues chorus, sixteen bars of an electronic track, with PRE seconds before its
first bar line and after its last, so the page can loop it from bar line to bar line whatever a
browser's mp3 decoder adds at the front. Every clip is brought to the same mean level.

TRACKS is the casting: which track plays at which stops of each world, and which bars of it.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "apps/takt/Takt/Content"
VENUES = ROOT / "apps/takt/Takt/Assets.xcassets/Venues"
OUT_DATA = ROOT / "src/app/takt/road/data.json"
OUT_AUDIO = ROOT / "public/takt/audio"
OUT_PHOTOS = ROOT / "public/takt/venues"
CONTAINER = Path.home() / "Library/Containers/com.bartdecrem.Takt/Data/tmp"
APP = "/Applications/Takt.app"

PRE = 0.25          # seconds of the record kept either side of the clip
MEAN = -17.0        # dBFS mean every clip is brought to
PHOTO_WIDTH = 640

# world -> [(song, first bar, bars, the stops it plays at)]
TRACKS = {
    "blues": [
        ("song-dockery", 12, 12, range(1, 4)),
        ("song-friars-point", 24, 12, range(4, 7)),
        ("song-blue-lantern", 12, 12, range(7, 9)),
        ("song-slow-burn", 12, 12, range(9, 11)),
        ("song-boogie-shoes", 12, 12, range(11, 14)),
        ("song-mclemore", 12, 12, range(14, 17)),
        ("song-pearl-street", 12, 12, range(17, 19)),
        ("song-maxwell-street", 24, 12, range(19, 21)),
        ("song-halsted", 60, 12, range(21, 27)),
    ],
    "electronic": [
        ("song-hypnotist", 48, 16, range(1, 4)),
        ("song-abyss", 24, 16, range(4, 7)),
        ("song-warm-nine", 24, 16, range(7, 10)),
        ("song-gezeiten", 64, 16, range(10, 13)),
        ("song-halbschatten", 56, 16, range(13, 16)),
        ("song-restlicht", 64, 16, range(16, 18)),
        ("song-streulicht", 72, 16, range(18, 21)),
        ("song-irrlicht", 72, 16, range(21, 24)),
        ("song-gegenlicht", 64, 16, range(24, 27)),
    ],
}
# The track under the opening screen, before the road.
OPENING = {"blues": "song-boogie-shoes", "electronic": "song-gegenlicht"}


def run(*cmd, **kw):
    return subprocess.run([str(c) for c in cmd], capture_output=True, text=True, **kw)


def render(song, tempo, seconds):
    wav = CONTAINER / f"road-{song}.wav"
    log = CONTAINER / f"road-{song}.log"
    wav.unlink(missing_ok=True)
    r = run("open", "-W", "-g", "-n", "--stdout", log, "--stderr", log, APP, "--args", "-Silent", "1",
            "-Tempo", tempo, "-RenderTo", wav, "-RenderSeconds", seconds,
            "-RenderScript", f"0:song={song}/melody,0:play", timeout=900)
    if not wav.exists():
        sys.exit(f"no render of {song}: {r.stderr.strip()} (is Takt running? pkill -f /Contents/MacOS/Takt)")
    return wav


def mean_volume(path, start, length):
    r = run("ffmpeg", "-hide_banner", "-ss", start, "-t", length, "-i", path, "-af", "volumedetect", "-f", "null", "-")
    vals = {}
    for line in r.stderr.splitlines():
        for key in ("mean_volume", "max_volume"):
            if key in line:
                vals[key] = float(line.split(key + ":")[1].split("dB")[0])
    return vals["mean_volume"], vals["max_volume"]


def main():
    do_render = "--no-render" not in sys.argv
    OUT_AUDIO.mkdir(parents=True, exist_ok=True)
    OUT_PHOTOS.mkdir(parents=True, exist_ok=True)
    CONTAINER.mkdir(parents=True, exist_ok=True)
    data = {"pre": PRE, "opening": {w: s.removeprefix("song-") for w, s in OPENING.items()}, "tracks": {}, "worlds": {}}

    for world, casting in TRACKS.items():
        track_at = {}
        for song, bar0, bars, stops in casting:
            tid = song.removeprefix("song-")
            for level in stops:
                track_at[level] = tid
            d = json.loads((CONTENT / f"{song}.json").read_text())
            s = d["song"]
            tpb, bpb, tempo = d["ticksPerBeat"], d["beatsPerBar"], s["tempo"]
            spb = 60 / tempo
            start, length = bar0 * bpb * spb, bars * bpb * spb
            wav = CONTAINER / f"road-{song}.wav"
            if do_render or not wav.exists():
                wav = render(song, tempo, int(start + length + 4))
            mean, peak = mean_volume(wav, start, length)
            gain = MEAN - mean
            # A short fade either end of the file; the loop itself never reaches them.
            af = f"volume={gain:.2f}dB,alimiter=limit=0.891:level=disabled,afade=t=in:d=0.02,afade=t=out:st={length + 2 * PRE - 0.05:.3f}:d=0.05"
            mp3 = OUT_AUDIO / f"{tid}.mp3"
            r = run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start - PRE:.6f}", "-t", f"{length + 2 * PRE:.6f}",
                    "-i", wav, "-af", af, "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "96k", mp3)
            if r.returncode:
                sys.exit(r.stderr)
            t0, t1 = bar0 * bpb * tpb, (bar0 + bars) * bpb * tpb
            notes = []
            for p, key in enumerate(("melody", "chords")):
                for n in s["parts"][key]["notes"]:
                    if t0 <= n["t"] < t1:
                        notes.append([round((n["t"] - t0) / tpb, 4), n["n"], round(min(n["len"], t1 - n["t"]) / tpb, 4), p])
            notes.sort()
            data["tracks"][tid] = {"title": s["title"], "style": s["style"], "key": s["key"], "tempo": tempo,
                                   "beats": bars * bpb, "audio": f"/takt/audio/{tid}.mp3", "notes": notes}
            print(f"{tid:16} bars {bar0}–{bar0 + bars} at {tempo}: {length:5.1f} s, {mean:6.1f} dB mean, {peak:5.1f} peak, "
                  f"gain {gain:+5.1f}, {len(notes)} notes, {mp3.stat().st_size // 1024} KB")

        m = json.loads((CONTENT / f"map-{world}.json").read_text())
        stops, episodes, level = [], [], 0
        for e, ep in enumerate(m["episodes"]):
            episodes.append({k: ep[k] for k in ("title", "kicker", "years")})
            for i, v in enumerate(ep["venues"]):
                level += 1
                stop = {"level": level, "episode": e, "opens": i == 0, "track": track_at[level]}
                if v.get("name"):
                    stop.update({k: v[k] for k in ("name", "town", "era", "tag")})
                    photo = v.get("photo")
                    if photo:
                        vid = Path(photo["file"]).stem
                        src = next((VENUES / f"{world}-{vid}.imageset").glob("*.jpg"))
                        out = OUT_PHOTOS / f"{world}-{vid}.jpg"
                        run("sips", "-Z", PHOTO_WIDTH, "-s", "format", "jpeg", "-s", "formatOptions", "68", src, "--out", out)
                        stop["photo"] = {"src": f"/takt/venues/{world}-{vid}.jpg", "credit": photo["credit"], "source": photo["source"],
                                         "note": photo.get("note")}
                stops.append(stop)
        data["worlds"][world] = {"title": m["title"], "episodes": episodes, "stops": stops}
        print(f"{world}: {len(stops)} stops, {sum(1 for x in stops if 'photo' in x)} photos")

    OUT_DATA.parent.mkdir(parents=True, exist_ok=True)
    OUT_DATA.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {OUT_DATA.relative_to(ROOT)} ({OUT_DATA.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
