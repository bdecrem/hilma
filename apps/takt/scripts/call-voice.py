#!/usr/bin/env python3
"""Render Call's vocabulary (Takt/Call/CallVoice.swift) with ElevenLabs into Takt/Sounds/call-*.caf.

    python3 apps/takt/scripts/call-voice.py            # render every word (skips ones already there)
    python3 apps/takt/scripts/call-voice.py --force    # render them all again
    python3 apps/takt/scripts/call-voice.py --check    # transcribe every clip with Whisper and compare
    python3 apps/takt/scripts/call-voice.py --only=a,g-sharp [--check]   # those words alone, rendered again

Call speaks the next note as finger then key ("three, C"), then "tuck" or "over" when the hand
crosses after it, "no" on a wrong key and "done" at the end: 26 words, one clip each, played back
to back by the app. River (ElevenLabs, Dodo's voice) on eleven_turbo_v2, the model that honours
phoneme tags: a bare "A" would be read as the article, so the letter is spelled /eɪ/. Each clip
is trimmed to its onset (-40 dB under the peak, 10 ms kept), cut where the tail falls 50 dB
(30 ms kept, a 15 ms fade), peak-normalized to -3 dBFS, 44.1 kHz mono 16-bit, Apple Lossless.
Keys: ELEVENLABS_API_KEY (and OPENAI_API_KEY for --check) from the environment or hilma's .env.local.
"""
import array
import io
import json
import math
import subprocess
import sys
import urllib.request
import uuid
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "Takt/Sounds"
ENV = HERE.parent.parent.parent / ".env.local"
VOICE = "SAz9YHcvj6GT2YYXdXww"  # River — relaxed, neutral, informative
MODEL = "eleven_turbo_v2"
RATE = 44100

A = '<phoneme alphabet="ipa" ph="eɪ">A</phoneme>'
WORDS = {
    "one": "One.", "two": "Two.", "three": "Three.", "four": "Four.", "five": "Five.",
    "c": "C.", "d": "D.", "e": "E.", "f": "F.", "g": "G.", "a": f"{A}.", "b": "B.",
    "c-sharp": "C sharp.", "d-sharp": "D sharp.", "f-sharp": "F sharp.", "g-sharp": "G sharp.", "a-sharp": f"{A} sharp.",
    "d-flat": "D flat.", "e-flat": "E flat.", "g-flat": "G flat.", "a-flat": f"{A} flat.", "b-flat": "B flat.",
    "tuck": "Tuck.", "over": "Over.", "no": "No.", "done": "Done.",
}
# What Whisper should hear (lower case, no punctuation).
EXPECT = {k: (v.replace(A, "a").rstrip(".").lower()) for k, v in WORDS.items()}


def env(name):
    import os
    if os.environ.get(name):
        return os.environ[name]
    for line in ENV.read_text().splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"')
    sys.exit(f"{name}: not in the environment or {ENV}")


def tts(text):
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}?output_format=pcm_{RATE}",
        data=json.dumps({"text": text, "model_id": MODEL,
                         "voice_settings": {"stability": 0.75, "similarity_boost": 0.8}}).encode(),
        headers={"xi-api-key": env("ELEVENLABS_API_KEY"), "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return array.array("h", r.read())


def trim(x):
    peak = max(1, max(abs(v) for v in x))
    on = peak * 10 ** (-40 / 20)
    off = peak * 10 ** (-50 / 20)
    start = next(i for i, v in enumerate(x) if abs(v) > on)
    end = next(i for i in range(len(x) - 1, -1, -1) if abs(x[i]) > off)
    start = max(0, start - RATE * 10 // 1000)
    end = min(len(x), end + RATE * 30 // 1000)
    y = x[start:end]
    gain = (0.708 * 32767) / peak  # -3 dBFS
    fade = RATE * 15 // 1000
    out = array.array("h")
    for i, v in enumerate(y):
        g = gain * (min(1.0, (len(y) - i) / fade))
        out.append(int(max(-32768, min(32767, round(v * g)))))
    return out


def write_wav(path, x):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(x.tobytes())


def render(force, only):
    OUT.mkdir(parents=True, exist_ok=True)
    for key, text in WORDS.items():
        caf = OUT / f"call-{key}.caf"
        if only and key not in only:
            continue
        if caf.exists() and not force and not only:
            continue
        x = trim(tts(text))
        wav = caf.with_suffix(".wav")
        write_wav(wav, x)
        subprocess.run(["afconvert", "-f", "caff", "-d", "alac", str(wav), str(caf)], check=True)
        wav.unlink()
        print(f"{caf.name:18} {len(x) / RATE:5.2f} s  {text}")


def transcribe(path):
    with wave.open(str(path), "rb") as w:
        data = w.readframes(w.getnframes())
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(data)
    boundary = uuid.uuid4().hex
    prompt = "Piano fingering, one word: one, two, three, four, five, C, D, E, F, G, A, B, sharp, flat, tuck, over, no, done."
    parts = []
    for name, value in [("model", "whisper-1"), ("language", "en"), ("prompt", prompt), ("temperature", "0")]:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="clip.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode()
                 + buf.getvalue() + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request("https://api.openai.com/v1/audio/transcriptions", data=b"".join(parts),
                                 headers={"Authorization": f"Bearer {env('OPENAI_API_KEY')}",
                                          "Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["text"]


def check(only):
    bad = 0
    for key in WORDS:
        if only and key not in only:
            continue
        caf = OUT / f"call-{key}.caf"
        wav = Path(f"/tmp/call-{key}.wav")
        subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16", str(caf), str(wav)], check=True)
        with wave.open(str(wav), "rb") as w:
            secs = w.getnframes() / w.getframerate()
        heard = "".join(ch for ch in transcribe(wav).lower() if ch.isalpha() or ch == " ").strip()
        ok = heard == EXPECT[key] or heard.replace(" ", "") == EXPECT[key].replace(" ", "")
        bad += not ok
        print(f"{'PASS' if ok else '??  '}  {caf.name:18} {secs:5.2f} s  heard \"{heard}\"  want \"{EXPECT[key]}\"")
        wav.unlink()
    print(f"{len(WORDS) - bad} of {len(WORDS)} clips transcribe as written")
    return bad == 0


if __name__ == "__main__":
    only = next((a.split("=", 1)[1].split(",") for a in sys.argv if a.startswith("--only=")), None)
    if "--check" in sys.argv:
        sys.exit(0 if check(only) else 1)
    render("--force" in sys.argv, only)
