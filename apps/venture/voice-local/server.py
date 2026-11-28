"""Kit's local voice (OLA-529): the ears and the mouth of a talk-page call, on the Mac Studio.

Plain HTTP, one whole request and one whole answer each, so it passes through a tunn3l tunnel
(https://kit-voice.tunn3l.sh, which buffers both and carries no WebSockets):
  POST /call?t=TOKEN                 -> {"call": id, "end_silence_ms": 800}
  POST /call/<id>/audio?t=TOKEN      body: the microphone, ~250 ms of 16 kHz mono int16 PCM
                                     -> {"events": [...]} everything since the last answer:
                                        {"type":"speech_started"} / {"type":"speech_stopped"} (Silero VAD)
                                        {"type":"transcript","text":"..."} his whole turn (Parakeet)
  POST /call/<id>/speak?t=TOKEN      body: one sentence (text/plain)
                                     -> 24 kHz mono int16 PCM of it (Kokoro af_heart)
  POST /call/<id>/end?t=TOKEN        -> {"ok": true}
  GET  /health                       -> {"ok": true}  (no token, says nothing else)
TOKEN is "<expiry>.<hex hmac-sha256(secret, 'kit-voice:'+expiry)>", minted by the Vercel talk
session route from the same secret; it sits in the query string so the browser's fetches are
"simple" requests (no preflight). Every route but /health refuses a missing, wrong or expired
token. A call with no request for IDLE_S is dropped.

The end of a turn is END_SILENCE_MS of quiet after at least MIN_SPEECH_MS of speech; talking
again inside that pause keeps the same turn. Logs carry counts and timings only, never words,
and no audio is written anywhere.

Run: KIT_VOICE_SECRET_FILE=~/.kit-voice-secret ~/voice-trial/.venv/bin/python server.py
"""

import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import numpy as np

HOST = os.environ.get("KIT_VOICE_HOST", "127.0.0.1")
PORT = int(os.environ.get("KIT_VOICE_PORT", "3941"))
HERE = os.path.dirname(os.path.abspath(__file__))
VAD_PATH = os.environ.get("KIT_VOICE_VAD", os.path.join(HERE, "silero_vad.jit"))
VOICE = "af_heart"
SR_IN = 16000
FRAME = 512  # Silero's window at 16 kHz: 32 ms
FRAME_MS = FRAME * 1000 / SR_IN
END_SILENCE_MS = 800  # the one constant: this much quiet ends his turn
MIN_SPEECH_MS = 160  # shorter than this is a click, not a word
PREROLL_MS = 320  # audio kept from just before speech began
MAX_TURN_S = 90
IDLE_S = 60
ON, OFF = 0.5, 0.35  # Silero speech probability: start, and stay-in-speech thresholds
ORIGINS = re.compile(r"^(https://ola\.cx|https://www\.ola\.cx|http://localhost(:\d+)?)$")


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def read_secret() -> bytes:
    path = os.path.expanduser(os.environ.get("KIT_VOICE_SECRET_FILE", "~/.kit-voice-secret"))
    s = open(path).read().strip()
    if len(s) < 32:
        sys.exit("secret file is missing or too short")
    return s.encode()


SECRET = read_secret()


def token_ok(t: str) -> bool:
    try:
        exp, sig = t.split(".", 1)
        if int(exp) < time.time():
            return False
        want = hmac.new(SECRET, f"kit-voice:{exp}".encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(want, sig)
    except Exception:
        return False


# All MLX work on one thread: Parakeet and Kokoro share the GPU and are not made for threads.
mlx = ThreadPoolExecutor(max_workers=1)
models = {}


def load_models():
    import mlx.core as mx
    import torch
    from mlx_audio.tts.utils import load_model
    from parakeet_mlx import from_pretrained
    from parakeet_mlx.audio import get_logmel

    t = time.time()
    models["stt"] = from_pretrained("mlx-community/parakeet-tdt-0.6b-v3")
    models["tts"] = load_model("mlx-community/Kokoro-82M-bf16")
    # get_logmel is lru_cached in parakeet-mlx: calling it directly would keep every turn's audio.
    models["mx"], models["logmel"] = mx, getattr(get_logmel, "__wrapped__", get_logmel)
    models["torch"] = torch
    torch.set_num_threads(1)
    speak("Ready.")
    transcribe(np.zeros(SR_IN, dtype=np.float32))
    log(f"models loaded in {time.time() - t:.1f}s")


def transcribe(audio: np.ndarray) -> str:
    m, mx = models["stt"], models["mx"]
    mel = models["logmel"](mx.array(audio, dtype=mx.float32), m.preprocessor_config)
    return m.generate(mel)[0].text.strip()


def speak(text: str) -> bytes:
    parts = []
    for r in models["tts"].generate(text=text, voice=VOICE, lang_code="a", split_pattern=r"(?<=[.!?])\s+"):
        parts.append(np.clip(np.array(r.audio).reshape(-1), -1, 1))
    a = np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)
    return (a * 32767).astype("<i2").tobytes()


class Call:
    def __init__(self):
        self.lock = threading.Lock()
        self.vad = models["torch"].jit.load(VAD_PATH)
        self.vad.reset_states()
        self.pending = np.zeros(0, dtype=np.float32)
        self.preroll = []
        self.turn = None  # frames of the turn in progress
        self.voiced_ms = 0.0
        self.quiet_ms = 0.0
        self.events = []
        self.seen = time.time()

    def audio(self, data: bytes) -> list:
        with self.lock:
            x = np.frombuffer(data[: len(data) // 2 * 2], dtype="<i2").astype(np.float32) / 32768
            self.pending = np.concatenate([self.pending, x])
            while self.pending.size >= FRAME:
                f, self.pending = self.pending[:FRAME], self.pending[FRAME:]
                self.frame(f)
            out, self.events = self.events, []
            return out

    def frame(self, f):
        p = self.vad(models["torch"].from_numpy(f.copy()), SR_IN).item()
        if self.turn is None:
            self.preroll.append(f)
            self.preroll = self.preroll[-int(PREROLL_MS / FRAME_MS) :]
            self.voiced_ms = self.voiced_ms + FRAME_MS if p >= ON else 0.0
            if self.voiced_ms >= MIN_SPEECH_MS:
                self.turn, self.preroll, self.quiet_ms = list(self.preroll), [], 0.0
                self.events.append({"type": "speech_started"})
            return
        self.turn.append(f)
        self.quiet_ms = self.quiet_ms + FRAME_MS if p < OFF else 0.0
        if self.quiet_ms >= END_SILENCE_MS or len(self.turn) * FRAME_MS >= MAX_TURN_S * 1000:
            keep = len(self.turn) - max(int((self.quiet_ms - 200) / FRAME_MS), 0)
            audio = np.concatenate(self.turn[:keep])
            self.turn, self.voiced_ms = None, 0.0
            self.events.append({"type": "speech_stopped"})
            # One MLX thread keeps the transcripts in order; the next poll carries the words.
            mlx.submit(self.hear, audio)

    def hear(self, audio):
        t = time.time()
        try:
            text = transcribe(audio)
        except Exception as e:
            log("listen failed:", type(e).__name__)
            text = ""
        log(f"heard {audio.size / SR_IN:.1f}s in {time.time() - t:.2f}s, {len(text.split())} words")
        with self.lock:
            self.events.append({"type": "transcript", "text": text})


calls: dict[str, Call] = {}
calls_lock = threading.Lock()


def reaper():
    while True:
        time.sleep(10)
        with calls_lock:
            for cid in [c for c, v in calls.items() if time.time() - v.seen > IDLE_S]:
                del calls[cid]
                log("call expired")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):  # no paths, no tokens in the log
        pass

    def cors(self):
        o = self.headers.get("Origin", "")
        if ORIGINS.match(o):
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Vary", "Origin")

    def answer(self, code: int, body: bytes, ctype="application/json"):
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def json(self, code: int, obj):
        self.answer(code, (json.dumps(obj) + "\n").encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if urlparse(self.path).path == "/health":
            return self.json(200, {"ok": bool(models)})
        self.json(404, {"error": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(min(n, 4 * 2**20)) if n else b""
        if not token_ok(parse_qs(u.query).get("t", [""])[0]):
            return self.json(401, {"error": "no"})
        if u.path == "/call":
            cid = secrets.token_urlsafe(18)
            with calls_lock:
                calls[cid] = Call()
            log("call opened")
            return self.json(200, {"call": cid, "end_silence_ms": END_SILENCE_MS})
        m = re.fullmatch(r"/call/([\w-]{20,40})/(audio|speak|end)", u.path)
        call = calls.get(m.group(1)) if m else None
        if not call:
            return self.json(404, {"error": "no such call"})
        call.seen = time.time()
        what = m.group(2)
        if what == "audio":
            return self.json(200, {"events": call.audio(body)})
        if what == "speak":
            text = body.decode("utf-8", "replace")[:4000].strip()
            t = time.time()
            pcm = mlx.submit(speak, text).result() if text else b""
            log(f"spoke {len(pcm) / 48000:.1f}s in {time.time() - t:.2f}s")
            return self.answer(200, pcm, "application/octet-stream")
        with calls_lock:
            calls.pop(m.group(1), None)
        log("call closed")
        return self.json(200, {"ok": True})


def main():
    mlx.submit(load_models).result()  # on the MLX thread, where every later call runs
    threading.Thread(target=reaper, daemon=True).start()
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    srv.daemon_threads = True
    log(f"listening on {HOST}:{PORT}")
    srv.serve_forever()


if __name__ == "__main__":
    main()
