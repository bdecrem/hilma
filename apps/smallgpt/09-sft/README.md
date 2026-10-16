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
