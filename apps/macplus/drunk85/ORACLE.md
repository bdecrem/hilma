# THE ORACLE — a neural net that runs on a Macintosh Plus

A tiny language model, trained from scratch on 1985 Usenet, that runs **natively
and locally on a real Macintosh Plus** (System 6, 68000, 8 MHz, no FPU, 1‑bit
B&W). You type a line; it continues it in the voice of a cranky Usenet nerd from
1986. No internet, no cloud — the machine is thinking by itself.

The whole thing ships as **one self-contained ~640 KB application**: the app,
the inference engine, the (int8‑quantized) model weights, and the tokenizer are
all inside a single `Oracle` file. Nothing to install alongside it, nothing on
the disk to shuffle.

> It is **not** a chatbot. It is a base language model: it *continues* text, it
> does not answer questions. Feed it the start of a thought and it riffs.

---

## The big picture — how the pieces fit

```
  ┌─────────────────────── on the dev Mac (this repo) ───────────────────────┐
  │  1. CORPUS      1980s Usenet (UTZOO/archive.org)  →  prepare.py           │
  │                 clean + tokenize (sentencepiece, 2048 vocab)             │
  │                                                                          │
  │  2. TRAIN       llama2.c/train.py on the corpus  →  ckpt.pt (~450K params)│
  │                                                                          │
  │  3. QUANTIZE    export.py --version 2  →  model_q.bin (int8, 471 KB)      │
  │                                                                          │
  │  4. ENGINE      make_gpt.py slices llama2.c/runq.c  →  gpt.c (portable)   │
  │                                                                          │
  │  5. EMBED+BUILD oracle.r embeds model_q.bin + tok as resources;          │
  │                 Retro68 compiles oracle.c + gpt.c  →  Oracle (~640 KB)    │
  └──────────────────────────────────────────────────────────────────────────┘
                                     │  deliver over The Bridge (OTA)
                                     ▼
  ┌──────────────────── on the real Macintosh Plus ─────────────────────────┐
  │  6. RUN         double‑click Oracle. It loads its own embedded 'MODL'/    │
  │                 'TOKN' resources into RAM, byte‑swaps them to big‑endian, │
  │                 and generates — ~1 token/minute at 8 MHz.                 │
  └──────────────────────────────────────────────────────────────────────────┘
```

### Why one file (and not app + model files)

Earlier versions kept the model as separate data files next to the app
(`Oracle.model`, `Oracle.tok`) and loaded them with `fopen`. That was fragile
and slow to set up: the 1.8 MB fp32 model was too big for the emulator's floppy
(so we couldn't test it), too big for The Bridge (which delivers apps, not big
data blobs), and had to be hand‑injected onto the SD card with `hfsutils`.

Folding everything into one binary fixed all of that at once:

- **One thing to ship.** The Bridge delivers the app; the app *is* the model.
- **Testable in the emulator.** Quantized + embedded, the app is ~640 KB and
  fits an 800 KB floppy, so the *real* model runs in Mini vMac. That is how we
  now verify inference before it ever touches hardware.
- **Fits the Plus's RAM.** int8 weights are ~471 KB instead of 1.8 MB.

---

## The engine / app split

Two clean layers, so future "clients" (e.g. a headless tweet machine) can reuse
the engine without the chat UI:

| Layer | Files | Responsibility |
|-------|-------|----------------|
| **Engine** | `mac/gpt.c`, `mac/gpt.h` | The transformer: load weights from an in‑RAM buffer, tokenize, run the int8 forward pass, sample. No UI, no Toolbox, no file I/O. Public API: `GptInitMem()`, `GptGenerate()`, `GptShutdown()`. |
| **App** | `mac/oracle.c`, `mac/oracle.r` | Classic‑Mac chat UI (window, transcript, input line, streaming, watch cursor). Gets the embedded resources and hands their pointers to the engine. |

`gpt.c` is **generated** from Karpathy's `llama2.c/runq.c` by `mac/make_gpt.py`
— the numeric code (quantize/dequantize, int8 matmul, forward, tokenizer,
sampler) is reused verbatim; only the load path and output path are swapped.
**Edit `make_gpt.py`, never `gpt.c` directly**, then re‑run it.

`GptInitMem(modelPtr, modelLen, tokPtr, tokLen, temperature, topp, seed)` takes
pointers to already‑in‑RAM data. `oracle.c` gets those from its own resources:

```c
Handle modelH = GetResource('MODL', 128);
Handle tokH   = GetResource('TOKN', 128);
HLock(modelH); HLock(tokH);                 /* weights are read in place */
GptInitMem(*modelH, GetHandleSize(modelH), *tokH, GetHandleSize(tokH), 0.8f, 0.9f, seed);
```

---

## The four things that made this hard (read before touching it)

1. **Endianness — the real blocker.** `llama2.c` checkpoints are **little‑endian**;
   the 68000 is **big‑endian**. Every multi‑byte value (magic number, config
   ints, the fp32 scale factors, tokenizer scores) is byte‑swapped when read on
   the Mac. Symptom: the magic‑number check fails and the app silently falls
   back to "demo voice." `gpt.c` handles it: header/tokenizer scalars are read
   little‑endian explicitly (`rd32`/`rdf`), and the fp32 weight/scale regions are
   byte‑swapped in place at load — guarded by a runtime `big_endian()` check, so
   it's a no‑op on the little‑endian dev machine and the host self‑test still
   passes.

2. **`Gestalt` is an unimplemented trap on the Plus ROM.** It crashed the real
   Plus with a "System error – unimplemented trap" bomb even though it worked in
   the emulator (whose newer System *has* Gestalt). Rule: **never call `Gestalt`
   in a Plus app.** Call `WaitNextEvent` directly, like every other app here.

3. **Memory.** The app declares a 2 MB partition (`SIZE` resource in `oracle.r`).
   The int8 model (~471 KB) + the transformer's KV cache/activation buffers
   (~0.8 MB) + code fit comfortably; the token‑embedding row is dequantized on
   the fly (in `forward()`) instead of holding a full dequantized fp32 table,
   saving ~500 KB.

4. **`sscanf("<0x%02hhX>")` doesn't work on Retro68** (no `hh` length modifier),
   so byte‑fallback tokens rendered literally as `<0x0A>`. `decode()` parses the
   two hex digits by hand instead (patched in `make_gpt.py`).

### Testing gotcha
**Mini vMac's host‑CPU usage is not an idle indicator.** It emulates the 8 MHz
Plus using only ~5 % of a modern core even under full guest compute. Do not
conclude "it returned / hung" from low host CPU — wait for actual on‑screen
output. (This cost real debugging time: generation was working the whole time
and just looked idle.)

---

## The model

| | |
|---|---|
| Corpus | 113,810 cleaned posts from 1980s Usenet (UTZOO tapes via archive.org): `net.flame`, `net.jokes`, `net.micro.mac`, `net.singles`, `net.unix-wizards`, … (~30 M tokens) |
| Tokenizer | sentencepiece BPE, **2048** vocab (`llama2.c/data/tok2048.*`) |
| Architecture | dim 64 · 6 layers · 8 heads · seq_len 256 · **~450K params** |
| Training | `llama2.c/train.py`, **on CPU** (MPS thrashes on a model this tiny), 12,000 iters, val loss ≈ 3.63 |
| Quantization | int8 Q8_0, group size 64 → **471 KB** (near‑lossless, max err ~0.0025) |

Voice sample (host, temp 0.8): *"the (sp?) from the 'MacWorld' is the Toronto
comments of Toronto"* / *"No, I have no treatment to run the 4.2bsd closer
versions."*

---

## File layout

```
drunk85/
  ORACLE.md                 ← this file
  prepare.py                ← corpus: extract 1980s Usenet mboxes → clean → vocab → tokenize
  llama2.c/                 ← Karpathy's repo (cloned; gitignored)
    train.py  export.py  runq.c  run.c
    out/plus64b/ckpt.pt     ← trained checkpoint
    out/plus64b/model_q.bin ← int8 quantized model (source for embedding)
    data/tok2048.{model,bin}← tokenizer
  .venv/                    ← python env (torch etc.; gitignored)
  mac/                      ← the classic‑Mac app
    make_gpt.py             ← GENERATES gpt.c from llama2.c/runq.c (edit this, not gpt.c)
    gpt.c  gpt.h            ← the portable int8 engine  (gpt.c is generated)
    oracle.c               ← the chat app (Toolbox UI + event loop)
    oracle.r               ← SIZE partition + embedded 'MODL'/'TOKN' resources
    winfull.inc            ← shared full‑screen window helper (copied from ../../net)
    model_q.bin  tok2048.bin← embedded by oracle.r (copies of the llama2.c outputs)
    CMakeLists.txt  build.sh← Retro68 build
    gpttest.c              ← HOST equivalence test (must match llama2.c runq byte‑for‑byte)
```

`drunk85/` is **excluded from the public Macinclaude mirror** (it bundles
`llama2.c`; see the denylist in `apps/macplus/publish/publish.sh`).

---

## Rebuild & deploy

**Build the app** (Retro68 toolchain required, see `../CLAUDE.md`):
```bash
cd apps/macplus/drunk85/mac
python3 make_gpt.py          # regenerate gpt.c from runq.c (only after changing the generator)
./build.sh                   # → build/Oracle.bin (~640 KB), Oracle.APPL, Oracle.dsk
```

**Verify the engine on the host** (fast, catches numeric regressions — must match
the reference exactly):
```bash
clang -O2 -o gpttest gpttest.c gpt.c -lm
./gpttest                                   # greedy generation from the embedded model
cd ../llama2.c && ./runq out/plus64b/model_q.bin -z data/tok2048.bin -t 0 -n 51 -i ""
# the two outputs must be identical
```

**Verify in Mini vMac** (the real model runs — this is the gold standard):
boot `Disk605.dsk`, insert `Oracle.dsk`, launch. Expect ~25 s to load, then the
greeting; generation is ~1 token/min, so be patient (see the CPU gotcha above).

**Deliver to the real Plus over The Bridge** (OTA): drop the app in the mini's
outbox; it installs in place when The Bridge is open on the Plus.
```bash
scp mac/build/Oracle.bin admin@192.168.7.50:~/bridge-outbox/
ssh admin@192.168.7.50 'tail -f ~/macplus-logs/all.log'   # watch for "app installed"
```
Note: at ~640 KB it takes **~20 min** over the paced link (vs ~2.5 min for a
small app). Relaunch the Plus from a clean boot after a Bridge update.

## Change the model (new corpus / different size)

1. Retrain / re‑tokenize with `prepare.py` + `llama2.c/train.py`.
2. Quantize: `cd llama2.c && ../.venv/bin/python export.py out/plus64b/model_q.bin --version 2 --checkpoint out/plus64b/ckpt.pt`
3. Copy the new `model_q.bin` (and `tok2048.bin` if the vocab changed) into `mac/`.
4. `./build.sh` re‑embeds them. Host‑test, emulator‑test, deliver.

If the vocab size changes, it's read from the checkpoint header automatically; no
code change. If the architecture dims change, likewise — the engine reads them
all from the header.

---

## Status & open decisions

- **Works, verified** end‑to‑end in Mini vMac: loads the embedded int8 model,
  generates 1985‑voice text. Byte‑for‑byte equal to the host reference.
- **Shipped** to the real Plus over The Bridge as a single self‑contained app.
- **Open: speed.** ~1 token/minute at 8 MHz (per‑token cost ~450K MACs, dominated
  by the FFN and the dim×vocab classifier matmul). This is fundamental to the
  hardware. Levers, if a snappier reply is wanted: a smaller model (dim 32 /
  fewer layers / vocab 1024 ≈ 5–8× faster, rougher voice), or embrace the
  slowness as the bit ("the Mac thinks for a minute, then speaks").
- **Later:** a headless "tweet machine" client can link `gpt.c` directly and
  generate without the chat UI, handing text to the mini over The Bridge.
```
