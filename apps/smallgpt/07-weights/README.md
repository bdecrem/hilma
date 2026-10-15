# 7 · Looking at the weights

One script, `embeddings.py`, on the Usenet model of step 6b. It takes the
embedding table (8,192 rows of 320 numbers, one row per token) out of
`out/usenet/final.pt` and puts it beside the table the run started from:
the same model built with train.py's seed (1337), which is exactly round 0's
random numbers. No round-0 checkpoint was saved and none is needed.

```bash
cd apps/smallgpt
.venv/bin/python 07-weights/embeddings.py      # a minute; needs data/usenet/val.bin
```

It prints the nearest neighbours of ten words (cosine similarity between
rows), runs nine analogies (the token nearest to b − a + c), and draws
`figures/map.png`: the 3,000 most common words squeezed from 320 numbers to 2
(PCA to 50, then UMAP), 50 of them labelled by group, before and after.

Tokens seen fewer than 20 times in val.bin (and tokens with no letters, like
`$$$$$$$$`) are left out of the lists. They were updated so rarely that their
rows stay near the middle of the space and turn up as noise next to
everything ("Laimbeer" next to "modem").

PLAN.md named king / queen. The Usenet tokenizer splits both (k|ing,
que|en), so a word has no single row; the analogies use words that are one
token: man / woman / he / she, Mac / Apple / PC / IBM.

## What we saw

Before training every list is noise: "Mac" is next to "iding, saves,
clusion"; "Monday" next to "lay, display, gover". After:

| word | nearest after training |
|---|---|
| Mac | mac, Macintosh, MAC, Amiga, .mac, Apple |
| modem | modems, receiver, telephone, rmail, uucp, tuner |
| IBM | Atari, ibm, Microsoft, Tandy, Apple |
| Monday | Tuesday, Wednesday, Friday, Saturday, Sunday, Thursday |
| three | four, five, two, six, nine, eight |
| good | Good, decent, great, bad, excellent |
| wife | father, parents, son, kids, woman |
| flame | flames, debate, critic, religious, lame, nuclear |

"good" sits next to "bad": both fit in the same places in a sentence, and
that is all the model can see.

Analogies, after training (before, all nine give noise):

| a : b = c : ? | answer |
|---|---|
| man : woman = he : ? | **she** |
| he : she = his : ? | **her** |
| Mac : Apple = PC : ? | **IBM** |
| Apple : Mac = IBM : ? | **PC** |
| Mac : Apple = Amiga : ? | **Commodore** |
| three : four = five : ? | **six** |
| is : was = have : ? | **had** |
| Monday : Tuesday = January : ? | December (wanted February) |
| Germany : German = Canada : ? | French, English |

Seven of eight right; Canada's language came out as French and English.

On the map the random table is one even cloud with the labels scattered
anywhere. After training the days are one dot, the months another, the
numbers another; the computers sit together, with the places and the family
words next to them; he and she are on top of each other.

## The explorer

`export.py` writes the table and two UMAP maps (2-D and 3-D, all 8,192
tokens) to `public/smallgpt/explorer/`, with 24 clusters found by k-means on
the rows scaled to length 1. The page at ola.cx/smallgpt/explorer
(`src/app/smallgpt/explorer/`) draws the maps with Plotly, and computes the
20 nearest neighbours and the word arithmetic in the browser over all 320
numbers. Rerun `export.py` if the model changes.

The clusters it finds are mostly grammar, not topics: verbs in -ing, words
in -ed, adjectives (old, high, bad, great), sentence openers (If, This, You),
newsgroup pieces (.arts, .unix, .mac). Grammar is what predicts the next
token most of the time.

## Whole words, layer by layer

The table has rows only for tokens; "queen" (que|en) has none. `words.py`
gives each of the 30,000 most common word forms a place from inside the
model: up to 20 sightings in real posts (the first 256 tokens of each, in a
shuffled order), the posts run through the model, the 320 numbers at the
word's last token read at every depth, averaged. Depth 0 is before any
attention (the last piece's table row plus its position); 1–6 are after each
attention layer. Nothing is predicted. `export_words.py` subtracts each
depth's average vector and writes depths 0, 3 and 6 for the page at
ola.cx/smallgpt/words.

```bash
nohup .venv/bin/python -u 07-weights/words.py > out/words/run.log 2>&1 &   # 13 min on the mini
.venv/bin/python 07-weights/export_words.py                                # 5 min
```

1,882,903 posts read, 29,854 words with 20 sightings, 41 with fewer than 5
(dropped). The first try ran ten encoding workers that each loaded PyTorch
and pushed the 16 GB mini 6 GB into swap; the workers now import only the
tokenizer.

What the layers do to a word, nearest neighbours:

| word | layer 0 | layer 3 | layer 6 |
|---|---|---|---|
| Gorbachev | mv, tv, gov, Bev, Rev | getenv, setenv, gov, Marv | Falwell, Sauron, Yeltsin, Wittgenstein, McCartney, Nixon |
| Challenger | Spencer, Anger, Primer, Builder | Messenger, passenger, Sequencer | Cruiser, Halley, Titan, Pegasus, Spitfire |
| queen | fourteen, golden, tungsten | eighteen, teen, thirteen | maiden, garden, hunter, wolf |
| beer | sooner, transformer, foster | Beer, beers, deer, container | container, washer, wine, beach |
| netiquette | Gazette, cassette, Corvette | etiquette, Corvette, diskette | etiquette, hierarchy, anarchy, censorship |
| Apple | Macintosh, IBM, Mac, Atari | Commodore, Macintosh, IBM | Mac, Macintosh, Adobe, Xerox |

At layer 0 a split word is only its last piece, so its neighbours rhyme
(Gorbachev ends in "v"). Layer 3 is still mostly spelling. By layer 6 the
neighbours are about meaning: famous names, spacecraft and aircraft, drinks,
how Usenet should be run. "Apple" is a single token, so it means something
from layer 0 on.

king − man + woman: "proving, catching" at layer 0, "kings, skiing" at 3,
"thief, creature, paladin, knight" at 6. It never reaches queen; at 10 M
parameters "king" lives in fantasy-game posts, next to paladins.

The guess beforehand was that a middle layer would be best for meaning and
the last layer would be all about the next token. Here the last layer is
clearly the most meaningful.
