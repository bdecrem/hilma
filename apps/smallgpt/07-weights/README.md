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
