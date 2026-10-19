# 11b · Golden Gate Cthulhu — feature steering

**Reverted 2026-10-19.** Part a added nothing interesting, so Cthulhu 92M and
its possession slider came off the chat page (`gpt.mjs`, `worker.mjs`,
`Chat.tsx` and `cthulhu.json` are back to before commit 85797d7). Part b is
not planned. Step 13 (RLVR) starts from step 11's PPO model. Everything below
is the record of what was tried.

Anthropic's Golden Gate Claude (May 2024): a sparse autoencoder over the
middle of Claude 3 Sonnet found a feature for the Golden Gate Bridge, and
clamping it high made the model talk about the bridge whatever it was asked.
This folder does the same thing to the 92M cranky hacker, with Cthulhu, and
without touching a weight: a direction is read off the model's own
activations and added back in while it writes.

Chosen 2026-10-18 after counting the corpus on the mini (see PLAN.md):
Cthulhu is 1,107 lines inside a tight cluster of lore the model learned
together (Lovecraft, Arkham, the Necronomicon, R'lyeh, the fhtagn chant),
two thirds of it rec.games.frp. Cats (14,007 lines) is the fallback, the
Amiga (228,443) the control.

## Part a · a direction by subtraction (2026-10-18)

`vector.py` runs 400 passages that mention Cthulhu through the model and 400
from the same newsgroups that never do, and reads the residual stream (the
vector each block adds to and passes on) at every layer. Three directions,
each positives minus negatives:

| kind | the positives' activations are read at | norm at layer 6 |
|---|---|---|
| `tokens` | the tokens of the mention itself | 16.3 |
| `after` | the 8 tokens after it | 4.3 |
| `passage` | every token of the passage | 1.7 |

(the residual stream's own mean norm at layer 6 is 39.5.) `steer.py` adds
`push` x that norm of the chosen direction to one block's output at every
position, prompt and answer alike, and generates; `--sweep` tries layers and
pushes on six unrelated questions. `check_steer.mjs` runs the same thing
through the chat page's JavaScript forward pass.

What happened, in order:

1. **Whole passages against random Usenet** (the first try): the direction
   is "rec.games.frp fantasy fandom", not Cthulhu. Steered answers are
   lists of sword-and-sorcery novels and D&D modules ("the Sword of
   Shannara", "Stormbringer", "Lord Foul's Heirs") with "Elder and Terrible"
   and "Unearthly" poking through; the name never comes.
2. **At the mention's own tokens, same-newsgroup negatives**: a cliff. At
   push 0.5 nothing; at 0.68 "the Cthulhu, the Cthulhu, the Cthulhu…" and
   nothing else. A direction read at the word is mostly "say this token".
3. **The tokens after the mention**: book lists again ("the Lovecraft Vol I
   Convention, Anthology, Vol. 25", ISBNs, "Analog, 1989, 1989, 1989"), and
   the name only once text has degenerated.
4. **Whole passages, matched negatives**: the same, with universities.
5. Five of the 768 dimensions (299, 193, 212, 663, 104) hold 40–50% of every
   direction's norm. They are the residual stream's outlier dimensions,
   carrying scale and position, not meaning; pushing them is what breaks the
   text. `MASK=8` zeroes the largest entries of the direction.

6. **Masked, at the tokens after the mention, layer 6, push 0.5** is the
   best this method gives: mostly bibliographies still, and once, the name
   in a sentence ("…the Dungeonsect Alpha Mortensinsal, ancientolo St.
   Cthulhu, 1939. Dunno if you'd seen it, maybe."). That is what ships:
   `public/smallgpt/chat/cthulhu.json` (the direction scaled so that
   possession 10 = one residual norm), the **Cthulhu 92M** button on
   `ola.cx/smallgpt/chat` with a **possession** slider (0 = the plain cranky
   model, whose weights it shares). `check_steer.mjs` matches `greedy.txt`
   on four of six questions token for token, the other two differ the way
   int8 and float32 already differ for the plain model.
7. **The control works.** The same method on the Amiga (`sweep-amiga-after.txt`,
   228k lines in the corpus against Cthulhu's 1.1k): at layer 8, push 0.5,
   the hacker stays coherent and cannot help himself: "the A500 and Mega 2
   ST and Amiga are far superior to the 2500/030, so why don't you get
   one?", "Get a commercial one, or get one that doesn't have an Amiga."
   So the tooling is right; Cthulhu is thin.

The lesson so far is the one the Golden Gate paper is about: a direction you
make by averaging is a blend of everything that co-occurs with the word (the
newsgroup, the register, the bibliography habit, the outlier dims), and a
small model has only a thin Cthulhu to begin with. A sparse autoencoder's
feature is a direction the model itself keeps separate. That is part b.

Files: `vector.py`, `steer.py`, `check_steer.mjs`, `sweep-*.txt` (every
sweep, kept so the failures stay visible). Outputs on the mini in
`out/steer/`.
