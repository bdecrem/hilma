# 6b · Pretraining on Usenet alone

Step 6 trained on TinyStories plus a quarter of 1980s Usenet. The stories came
out well; the Usenet side only got the vocabulary. A 10 M model has no room
for two voices this different, so this side step drops the stories and trains
the same model on as much 1981–1991 Usenet as archive.org still has. Steps 2
and 3 (tokenizer, dataset) are redone for the new corpus; the bigram and the
one-layer runs (steps 4 and 5) are skipped.

Four scripts, run in order on the Mac mini (the iMac has no room for the
downloads):

```bash
cd apps/smallgpt
nohup .venv/bin/python -u 06b-usenet/fetch.py > data/usenet/fetch.log 2>&1 &   # 41 min
.venv/bin/python 06b-usenet/clean.py                                           # a few min
.venv/bin/python 06b-usenet/tokenizer.py > data/usenet/tokenizer.log           # a few min
.venv/bin/python 06b-usenet/prepare.py                                         # 35 s
nohup .venv/bin/python -u 06-pretrain/train.py --usenet --epochs 1 > out/usenet/run.log 2>&1 &
.venv/bin/python 06-pretrain/report.py out/usenet/log.jsonl 06b-usenet/figures/loss.png
.venv/bin/python 06-pretrain/complete.py --usenet "Newsgroups: comp.sys.mac\nSubject: Mac Plus won't boot\n\n"
```

## Fetching

archive.org's Usenet Historical Collection has one zipped mbox per newsgroup,
in items by hierarchy (`usenet-net`, `usenet-comp`, `usenet-rec`, …; alt.* is
left out, 234 GB of mostly later years). Each mbox mixes every year the group
existed, so `fetch.py` downloads each whole group, keeps the posts dated
1981–1991 (`X-Google-ArrivalTime`, else `Date`) and deletes the zip. 3,573
groups in 41 minutes, 2,491,905 posts kept.

The first run split posts only on `From <digits>` lines. Google's mbox ids
can be negative (`From -5862978036047865596`), so half the posts were glued to
the one before them. With the fix the kept count doubled, from 1.25 M to 2.49 M.

## Cleaning

`clean.py` takes out what isn't the poster's own writing: quoted lines and
the "In article … writes:" line before them, signatures, header lines that
leaked into the body, bang paths, the old notesfiles software's `#R:` and
`/* Written … */` lines. It drops whole posts that are binaries or shell
archives, source or table posts (more than a quarter of the lines look like
code), posts outside 100–6,000 characters, crossposts (same Message-ID) and
reposts (same first 300 characters), and whole groups made of those
(comp.sources.*, *.binaries, maps, tests, control). Each post starts with its
group and subject:

```
Newsgroups: comp.sys.mac
Subject: StartupScreen size

How do I get the StartupScreen [created in SuperPaint] to fill the ...
```

1,882,903 posts kept, 1.7 GB. Dropped: code or table 176,162, length
171,406, crosspost 162,546, skipped group 61,146, repost 33,227, binary 4,513.
By year it leans late (1985: 126 k, 1990: 455 k, 1991: 664 k); by hierarchy
comp 804 k, rec 493 k, net 334 k, sci 88 k.

## Tokenizer and dataset

Step 2's BPE, trained on a 4 MB sample from 64 places in the corpus, vocabulary
8,192 (`tok8192.json`). Macintosh, Mac, Apple, unix, Usenet, modem, disk,
kernel, compiler, floppy, baud, VAX, PDP, flame, man and woman are one token
each. Reagan is Re|ag|an, king is k|ing, queen is que|en, and Lily is L|ily:
this tokenizer has never seen a children's story. 497 M training tokens and
5.0 M validation tokens (every 100th post), 267 tokens per post, five times
step 6's data.

## Training

`06-pretrain/train.py --usenet --epochs 1`: the same 10.1 M model and loop as
step 6, one pass, 30,329 rounds of 64 × 256 tokens, 7.8 hours on the mini
(0.92 s a round). Loss 9.06 → 6.23 at round 200 → 4.64 at 1,000 → 3.81 at
5,000 → 3.60 at 10,000 → 3.43 at 20,000 → 3.37 at the end, train and val
together the whole way (`figures/loss.png`). Usenet is far less predictable
than children's stories, so 3.37 can't be compared with step 6's 2.08.

The same prompt through the run:

- round 0: "My Macintosh crashed again and I think the problem is|	C flame
  complete segment sense technical distin28 Note S bodyprocessorrc …"
- round 1,000: "… is| just wrong for the spacecos. I don't think the way it
  was that Q2 actual orders an Tin art (which I still got a nice tanks) have"
- round 3,000: "… is| that my timing specific ware quite strictly. :-)" and then
  it ends the post and starts a new one: "Newsgroups: comp.sys.apple Subject:
  IIgs Question I have the new IIgs."
- round 20,000: "… is| (a) the way I saw it they hadn't become user so I felt
  that the screen-system pulling down would not flash pretty well."

The finished model, given a group and a subject:

- comp.sys.mac, "Mac Plus won't boot": "Anyone know if the Mac Plus will work?
  I want a sort of mod or a Mac Mac cd but I haven't been able to find a
  replacement for Mac Plus."
- rec.arts.startrek, "Re: Best episode ever": "I wrote the latest Trek first
  season (I think it worked all in everyday... ). Lots of spoilers for ST 4"
- comp.ai, "Can computers think?": "A lot of the questions I've been asked
  recently about a PC here is: What do students think the good hardware house
  is large, state-based?"
- net.politics, "Re: Reagan": "Great Wars and Israel, the European government
  makes printed right to an Internet Scientist."

It has each group's voice, sentence by sentence, but a thought doesn't carry
from one sentence to the next. The model is `out/usenet/final.pt` (53 MB).
