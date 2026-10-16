# 9 · SFT

Supervised fine-tuning: the Usenet base model of step 6b trained a little
more, on conversations instead of posts, so it answers a question instead of
continuing it. No new kind of learning: it is step 6's training loop with a
different dataset, two new tokens and a mask.

```bash
cd apps/smallgpt
.venv/bin/python 09-sft/gen.py       # the dataset, ~25 min (claude CLI, 60 calls)
.venv/bin/python 09-sft/sft.py       # training, 90 s on the iMac
.venv/bin/python 09-sft/ask.py       # base vs SFT on the same questions -> compare.txt
.venv/bin/python 09-sft/ask.py "Is a 2400 baud modem worth it?"
.venv/bin/python 09-sft/chat.py      # a web page to talk to it: http://localhost:3270
```

Step 9b, the cranky hacker (the model the chat page uses):

```bash
python3 09-sft/threads.py              # on the Mac mini, where the raw archive is: real questions + replies, 42 s
.venv/bin/python 09-sft/usenet_qa.py   # Claude cleans 4,800 of them into pairs, ~35 min
.venv/bin/python 09-sft/sft.py --data 09-sft/qa-usenet.jsonl --out sft-usenet --epochs 2
.venv/bin/python 09-sft/export_web.py  # the models as files for ola.cx/smallgpt/chat
```

## The data

`gen.py` has Claude (Sonnet 5.5, through the `claude` CLI on this machine's
login) write 50 question-and-answer pairs on each of 60 topics from 1985–1991
computing: the Mac Plus, the Amiga, MS-DOS, modems and AT commands, BBSes,
Usenet and netiquette, Unix, vi, VAX/VMS, viruses, WordPerfect, Lotus 1-2-3,
TeX and so on. Questions are one plain sentence; answers are one to four short
sentences (15–60 words) in the voice of a helpful Usenet regular, with no
greeting, quotes or signature, and nothing after 1991. 2,945 pairs after
duplicates, in `qa.jsonl`. Every 20th pair is held out: 2,797 to train, 148 to
measure.

A narrow topic the base model already read about, and a short, consistent
answer shape, because a 10 M model can learn a format but not much knowledge.

## The format

Two new tokens, so a conversation is

```
<|user|>Can I run System 6 on a Mac Plus?<|assistant|>Yes, ... <|endoftext|>
```

The tokenizer had 8,192 ids, the last one `<|endoftext|>`; `<|user|>` is
8,192 and `<|assistant|>` 8,193. The embedding table gets two new rows (it
is also the output head, so the model can now write them too), started at
the average of the old rows plus a little noise. Everything else in the
checkpoint is copied as it was.

## The mask

The loss only counts predictions of the answer and the `<|endoftext|>` after
it. The question is input; the model shouldn't spend effort learning to write
questions. In code that is one line: the targets before the answer are set to
-100, which `cross_entropy` skips.

## Training

AdamW at a peak of 1e-4 (a tenth of pretraining: nudge the weights, don't
overwrite them), 30 rounds of warmup, cosine down, batches of 32
conversations padded to the longest, 4 passes over the data: 352 rounds, 90
seconds on the iMac.

Loss on the held-out answers:

| round | 0 | 75 | 150 | 225 | 352 |
|---|---|---|---|---|---|
| val | 4.17 | 3.39 | 3.32 | 3.31 | 3.31 |

Almost all of it happens in the first pass. Two variations, same data:

- **Learning rate 3e-4:** 3.34 after two passes, then up to 3.44 — it starts
  memorizing the training answers. 1e-4 stays.
- **No mask** (`--no-mask`): 3.305, the same as with the mask. Here the
  questions are short, only 20% of the tokens, and they look like the
  answers, so learning them costs nothing. The mask matters when the prompt
  is long (a document to summarize, a long system prompt) and would drown
  the answer's share of the loss.

## What we saw

The same question to both models (temperature 0.7, top 40, same seed). The
base model has never seen a conversation; it reads the question as the start
of a post and keeps going as the person asking. The SFT model answers, in the
answer voice, and stops by itself.

```
Q: How do I get my modem to dial a BBS?
  base: I tried sending mail to this BBS but it doesn't seem to do any popup
        problem. Thanks in advance for any help anyone can offer. Barry
  sft:  Type the terminal program to open it, and set the modem to 1, 2, 3, 4.
        5, 5, 5 and 5. It gives the modem set, with a modem on the cable.

Q: Which is better, Font/DA Mover or just putting fonts in the System file?
  base: I tried sending mail to this account but it didn't seem to do any
        single or single or double or double margin. ...
  sft:  Font/DA Mover is faster and is well worth the salt, but you need a font
        file if you are on the network.

Q: Is an Amiga better than an Atari ST for music?
  base: I know, I'm not out for that; I want a decent Amiga, but I want to be
        able to play the SoundBlaster and have a MIDI output. ... Thanks, Robert
  sft:  Yes, the ST has a big rough and has a lot of sound. If you do, the Amiga
        is cheaper and the Amiga is cheaper.
```

All twelve are in `compare.txt`. The shape is learned completely: every
answer starts with "Yes," or "Type …" or "It's …", is two or three sentences
and ends. The content is mostly wrong — "8-N-1 are the best word processors",
a Mac Plus with "a 1.44 meg floppy drive". That is the point of SFT, and its
limit: it teaches a model how to answer, not what is true. What the model
knows came from pretraining, and at 10 M parameters that is the right words
in roughly the right neighbourhood (Font/DA Mover with fonts, modems with
terminal programs and cables) without the facts.

## 9b · The cranky hacker, from real threads

SFT copies the voice of its answers, and the answers above were written as a
helpful regular. For a cranky 1985 hacker we went back to the archive itself.

**Real questions, real replies.** A Usenet reply usually opens with "In article
<message-id> someone writes:", and that id is the post it answers.
`threads.py` reads the raw archive (2.5 M posts, on the Mac mini), keeps the
posts that start a thread and ask something (no "Re:", a question mark,
60–1,500 characters after step 6b's cleaning) and the replies that name one of
them. 445,913 question posts, 522,154 replies naming a parent, 91,884
questions with at least one reply — 57% from comp.*, the rest mostly rec.*.

**Cleaned, and made crankier.** `usenet_qa.py` samples 4,800 of those (three
quarters comp.*), and Claude goes through them thirty at a time: it drops
the ones that don't work as a question and answer (no real answer, an
announcement, a code listing, private details), writes the question the way
the poster would ask it in a sentence or two, and the answer from what the
replies actually said, one to four sentences, every one with a cranky touch.
The facts come from the replies. 3,206 kept (81% comp.*), in `qa-usenet.jsonl`:

```
Q: Is there a simple way to get double-spacing in LaTeX or TeX? ...
A: In LaTeX, put \renewcommand{\baselinestretch}{2.0} before \begin{document}.
   In plain TeX, set \baselineskip. Sigh, it's all in the manual if you look
   in the right place.
```

**Training.** The same `sft.py`, from the same Usenet base model (not from the
helpful one). Questions are longer here (25 words on average, answers 39), so
37% of the tokens are masked instead of 20%. Held-out loss: 4.02 → 3.45 after
two passes. Four passes bottomed at 3.456 in the second and climbed to 3.480
by the fourth (memorizing), so the kept model has two: 192 rounds, 66 seconds.

**What it says.** Rambling and repetitive, mostly wrong, and grumpy at the
end: "Basic stuff.", "Go quit whining.", "Check the dealer before asking the
net.", "Ignore it, and I'll dig up a good deal next time." Now and then a
real fact from pretraining comes through, in the right place:

```
Q: Where can I get the source for GNU Emacs?
A: There's a free-standing GNU Emacs package for the PC with Minix. It's a PD
   port of GNU Emacs, not GNU Emacs; it's available on prep.ai.mit.edu in
   pub/gnu. ...
```

The loss is higher than the helpful model's (3.45 vs 3.31) because real
replies are less predictable than Claude's tidy ones, not because it learned
less.

## The chat page

ola.cx/smallgpt/chat runs the models in the browser, with no server.
`export_web.py` writes each one as int8 matrices with one float32 scale per
row (10.3 MB instead of 41) plus the tokenizer's merges, into
`public/smallgpt/chat/`. `gpt.mjs` is the tokenizer and the forward pass in
plain JavaScript, one token at a time with a cache of the earlier tokens' keys
and values: about 9 ms a token on the iMac, in Chrome and Safari. Greedy
answers from the int8 weights match float32 PyTorch token for token, and the
JavaScript matches PyTorch on the same int8 weights token for token. The page
offers the cranky model (default), the helpful one, and the base model beside
either.
