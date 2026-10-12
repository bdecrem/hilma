# 2 · Tokenizer (BPE)

How text becomes numbers. Three files:

- `fetch_corpus.py` — assembles the corpus into `data/` (gitignored):
  `tinystories.txt`, the first 314 MB of TinyStories V2 (384,146 GPT-4-written
  children's stories; fetched with a range request, not the whole 2.2 GB), and
  `usenet.txt`, the 81 MB of cleaned 1980s Usenet (113,810 posts — `net.micro.mac`,
  `net.micro.68k`, `net.unix-wizards`, `net.flame`, `net.jokes`, …) that the
  Mac Plus Oracle was trained on, copied from `apps/macplus/drunk85/data/`.
  Documents are separated by `<|endoftext|>`.
- `bpe.py` — the tokenizer, ~150 lines: split text into chunks with GPT-4's
  regex (a word carries the space before it), start from the 256 bytes, and
  repeatedly merge the most frequent neighbouring pair. `encode`, `decode`,
  `save`/`load`, and `truncated(n)` = the same training stopped at a smaller
  vocabulary.
- `train.py` — trains on a 4 MB sample (3 MB stories + 1 MB Usenet, slices
  spread through both files), prints the merges as they happen, saves
  `tok8192.json`, and prints the checks below. About two minutes.

```bash
cd apps/smallgpt
.venv/bin/python 02-tokenizer/fetch_corpus.py   # ~1 min, 395 MB into data/
.venv/bin/python 02-tokenizer/train.py          # ~2 min
```

## What we saw (2026-10-12)

The merges, in order. The first ones are letters that travel together; by a
few hundred in they are words:

```
merge    1: ' ' + 't'      -> ' t'       (109,862 times)
merge    2: 'h' + 'e'      -> 'he'       (104,170 times)
merge    7: ' t' + 'he'    -> ' the'      (50,041 times)
merge   13: ' a' + 'nd'    -> ' and'      (30,426 times)
merge  250: 'w' + 'ay'     -> 'way'        (2,032 times)
merge 2250: ' mach' + 'ine' -> ' machine'     (75 times)
merge 4000: ' en' + 'orm'  -> ' enorm'        (31 times)
merge 6000: 'alend' + 'ar' -> 'alendar'       (16 times)
```

The same words at two vocabulary sizes (8,192 is the full training, 4,096
the same merges stopped early):

```
                vocab 4096        vocab 8192
' king'         king              king
' queen'        q|ue|en           queen
' man'          man               man
' woman'        woman             woman
' computer'     computer          computer
' Macintosh'    Mac|into|sh       Macintosh
' unix'         un|ix             unix
' Usenet'       Us|en|et          Usenet
' modem'        mod|em            modem
```

A story sentence: 79 characters → 18 tokens, one per word.
A Usenet sentence at 8,192: 91 characters → 25 tokens —
`I| just| got| my| |512|K| Mac| upgr|aded| and| the| new| System| file| won|'t| boot| from| the| ext|ern|al| drive|.`
`decode(encode(s)) == s` for both.

Tokens in a 1 MB slice of the corpus by vocabulary size: 475k at 512, 367k
at 1024, 316k at 2048, 285k at 4096, 268k at 8192 (3.9 characters per token).
The whole 377 MB corpus is about **101 million tokens** at 8,192.

**Decision: vocabulary 8,192.** At 4,096 the mix had no single token for
"queen", "Macintosh", "unix", "Usenet" or "modem" — the step-7 king/queen
probe and the Mac Plus voice both want those as one token each. The cost is
a bigger embedding table in step 6 (8,192 rows instead of 4,096).

## Two things worth staring at in the code

- `train` dedupes the chunks before merging: 980k chunks in the sample, but
  only 31k distinct ones — "the" is merged once, not a hundred thousand times.
- `_encode_chunk` replays the merges by rank: of all pairs present in a chunk,
  merge the one that was learned earliest, repeat. That is why the merge order
  *is* the tokenizer.

A lesson from the first run: the Usenet file is ordered by newsgroup
(`net.bizarre` first, `net.micro.mac` far in), and a sample taken from its
start saw no Mac talk at all. `sample()` now takes slices from all through
each file.
