"""Kit's local voice (OLA-529): the ears and the mouth of a talk-page call, on the Mac Studio.

One WebSocket per call, behind `tailscale serve` (https on the tailnet only):
  browser -> server   binary: the microphone, 16 kHz mono int16 PCM
                      {"type":"speak","id":<int>,"text":"..."}   read this aloud (Kokoro af_heart)
                      {"type":"cancel"}                          stop every reading in progress
  server -> browser   {"type":"ready"}
                      {"type":"speech_started"} / {"type":"speech_stopped"}   (Silero VAD)
                      {"type":"transcript","text":"..."}         his whole turn (Parakeet)
                      binary: 4-byte little-endian id, then 24 kHz mono int16 PCM (one sentence)
                      {"type":"speak_done","id":<int>}
GET /health answers {"ok":true}. Every call carries ?t=<token>: "<expiry>.<hex hmac-sha256(secret,
'kit-voice:'+expiry)>", minted by the Vercel talk session route from the same secret.

The end of a turn is END_SILENCE_MS of silence after at least MIN_SPEECH_MS of speech; talking
again inside that pause keeps the same turn. Logs carry counts and timings only, never words,
and no audio is written anywhere.

Run: KIT_VOICE_SECRET_FILE=~/.kit-voice-secret ~/voice-trial/.venv/bin/python server.py
"""

import asyncio
import hashlib
import hmac
import json
import os
import struct
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from http import HTTPStatus
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
ON, OFF = 0.5, 0.35  # Silero speech probability: start, and stay-in-speech thresholds


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
    from mlx_audio.tts.utils import load_model
    from parakeet_mlx import from_pretrained
    from parakeet_mlx.audio import get_logmel

    t = time.time()
    models["stt"] = from_pretrained("mlx-community/parakeet-tdt-0.6b-v3")
    models["tts"] = load_model("mlx-community/Kokoro-82M-bf16")
    # get_logmel is lru_cached in parakeet-mlx: calling it directly would keep every turn's audio.
    models["mx"], models["logmel"] = mx, getattr(get_logmel, "__wrapped__", get_logmel)
    # Warm both once so the first call is not slow.
    list(models["tts"].generate(text="Ready.", voice=VOICE, lang_code="a"))
    transcribe(np.zeros(SR_IN, dtype=np.float32))
    log(f"models loaded in {time.time() - t:.1f}s")


def transcribe(audio: np.ndarray) -> str:
    m, mx = models["stt"], models["mx"]
    mel = models["logmel"](mx.array(audio, dtype=mx.float32), m.preprocessor_config)
    return m.generate(mel)[0].text.strip()


def speak(text: str, on_audio, cancelled) -> int:
    n = 0
    for r in models["tts"].generate(text=text, voice=VOICE, lang_code="a", split_pattern=r"(?<=[.!?])\s+"):
        if cancelled():
            break
        a = np.clip(np.array(r.audio).reshape(-1), -1, 1)
        on_audio((a * 32767).astype("<i2").tobytes())
        n += a.size
    return n


class Call:
    def __init__(self, ws):
        import torch

        self.ws = ws
        self.vad = torch.jit.load(VAD_PATH)
        self.vad.reset_states()
        self.torch = torch
        self.pending = np.zeros(0, dtype=np.float32)
        self.preroll = []
        self.turn = None  # frames of the turn in progress
        self.voiced_ms = 0.0
        self.quiet_ms = 0.0
        self.epoch = 0  # bumped by cancel: readings of an older epoch stop
        self.loop = asyncio.get_running_loop()

    def send(self, obj):
        return self.ws.send(json.dumps(obj))

    async def on_audio(self, data: bytes):
        x = np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768
        self.pending = np.concatenate([self.pending, x])
        while self.pending.size >= FRAME:
            f, self.pending = self.pending[:FRAME], self.pending[FRAME:]
            await self.on_frame(f)

    async def on_frame(self, f):
        p = self.vad(self.torch.from_numpy(f), SR_IN).item()
        if self.turn is None:
            self.preroll.append(f)
            self.preroll = self.preroll[-int(PREROLL_MS / FRAME_MS) :]
            self.voiced_ms = self.voiced_ms + FRAME_MS if p >= ON else 0.0
            if self.voiced_ms >= MIN_SPEECH_MS:
                self.turn, self.preroll, self.quiet_ms = list(self.preroll), [], 0.0
                await self.send({"type": "speech_started"})
            return
        self.turn.append(f)
        self.quiet_ms = self.quiet_ms + FRAME_MS if p < OFF else 0.0
        if self.quiet_ms >= END_SILENCE_MS or len(self.turn) * FRAME_MS >= MAX_TURN_S * 1000:
            keep = len(self.turn) - max(int((self.quiet_ms - 200) / FRAME_MS), 0)
            audio = np.concatenate(self.turn[:keep])
            self.turn, self.voiced_ms = None, 0.0
            await self.send({"type": "speech_stopped"})
            # One MLX thread keeps the transcripts in order; the VAD goes on meanwhile.
            asyncio.create_task(self.hear(audio))

    async def hear(self, audio):
        t = time.time()
        try:
            text = await self.loop.run_in_executor(mlx, transcribe, audio)
        except Exception as e:
            log("listen failed:", type(e).__name__)
            text = ""
        log(f"heard {audio.size / SR_IN:.1f}s in {time.time() - t:.2f}s, {len(text.split())} words")
        await self.send({"type": "transcript", "text": text})

    async def on_speak(self, rid: int, text: str):
        epoch = self.epoch
        head = struct.pack("<I", rid)
        t = time.time()

        def out(pcm: bytes):
            asyncio.run_coroutine_threadsafe(self.ws.send(head + pcm), self.loop)

        n = await self.loop.run_in_executor(mlx, speak, text, out, lambda: self.epoch != epoch)
        log(f"spoke {n / 24000:.1f}s in {time.time() - t:.2f}s{' (cut)' if self.epoch != epoch else ''}")
        await self.send({"type": "speak_done", "id": rid})


async def handler(ws):
    call = Call(ws)
    log("call opened")
    await call.send({"type": "ready", "end_silence_ms": END_SILENCE_MS})
    tasks = set()
    try:
        async for msg in ws:
            if isinstance(msg, bytes):
                await call.on_audio(msg)
                continue
            m = json.loads(msg)
            if m.get("type") == "speak" and isinstance(m.get("text"), str):
                task = asyncio.create_task(call.on_speak(int(m.get("id", 0)), m["text"][:4000]))
                tasks.add(task)
                task.add_done_callback(tasks.discard)
            elif m.get("type") == "cancel":
                call.epoch += 1
    except Exception as e:
        log("call error:", type(e).__name__)
    finally:
        call.epoch += 1
        log("call closed")


def process_request(connection, request):
    u = urlparse(request.path)
    if not token_ok(parse_qs(u.query).get("t", [""])[0]):
        return connection.respond(HTTPStatus.UNAUTHORIZED, "no\n")
    if u.path == "/health":
        r = connection.respond(HTTPStatus.OK, json.dumps({"ok": bool(models), "voice": VOICE}) + "\n")
        r.headers["Content-Type"] = "application/json"
        r.headers["Access-Control-Allow-Origin"] = "*"
        return r
    if u.path != "/ws":
        return connection.respond(HTTPStatus.NOT_FOUND, "no\n")
    return None


async def main():
    from websockets.asyncio.server import serve

    await asyncio.get_running_loop().run_in_executor(mlx, load_models)
    async with serve(handler, HOST, PORT, process_request=process_request, max_size=2**22, ping_interval=20):
        log(f"listening on {HOST}:{PORT}")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
