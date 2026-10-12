"""Step 2: a byte-pair-encoding tokenizer, from scratch.

How text becomes numbers:

  1. Split the text into chunks with a regex — words, numbers, punctuation,
     each with the space before it attached (" king", not "king"). Merges
     never cross a chunk boundary, so a token is never "e t" from "the time".
  2. Every chunk starts as its UTF-8 bytes: 256 possible starting tokens.
  3. Training: count every adjacent pair of tokens across the whole text,
     merge the most frequent pair into one new token, repeat. The order of
     the merges IS the tokenizer.
  4. Encoding new text replays the merges in the same order; decoding
     concatenates each token's bytes.

A vocabulary of 4,096 = 256 bytes + 3,839 merges + one special token,
<|endoftext|>, that marks document boundaries. (After Karpathy's minbpe.)
"""

import json
import regex  # the third-party `regex` module: it knows \p{L} (any letter), the stdlib `re` doesn't

# GPT-4's split pattern: contractions, words with their leading space, numbers up
# to 3 digits, punctuation runs, newlines/whitespace.
SPLIT_PATTERN = r"""'(?i:[sdmt]|ll|ve|re)|[^\r\n\p{L}\p{N}]?+\p{L}+|\p{N}{1,3}| ?[^\s\p{L}\p{N}]++[\r\n]*|\s*[\r\n]|\s+(?!\S)|\s+"""

EOT = "<|endoftext|>"


def count_pairs(chunks):
    """How often does each adjacent pair of tokens occur? chunks = {tuple of ids: how many times that chunk appears}."""
    counts = {}
    for ids, n in chunks.items():
        for pair in zip(ids, ids[1:]):
            counts[pair] = counts.get(pair, 0) + n
    return counts


def merge(ids, pair, new_id):
    """Replace every occurrence of `pair` in `ids` with `new_id`."""
    out = []
    i = 0
    while i < len(ids):
        if i < len(ids) - 1 and ids[i] == pair[0] and ids[i + 1] == pair[1]:
            out.append(new_id)
            i += 2
        else:
            out.append(ids[i])
            i += 1
    return tuple(out)


class Tokenizer:
    def __init__(self):
        self.merges = {}   # (id, id) -> new id, in the order they were learned
        self.vocab = {i: bytes([i]) for i in range(256)}  # id -> the bytes it stands for
        self.special = {}  # "<|endoftext|>" -> id
        self._split = regex.compile(SPLIT_PATTERN)
        self._cache = {}

    # --- training ---------------------------------------------------------

    def train(self, text, vocab_size, log=None):
        n_merges = vocab_size - 256 - 1  # one id is kept for <|endoftext|>
        # Dedupe the chunks: "the" appears a million times, we only need to merge it once.
        chunks = {}
        for m in self._split.finditer(text):
            ids = tuple(m.group().encode("utf-8"))
            chunks[ids] = chunks.get(ids, 0) + 1
        if log:
            log(f"{sum(chunks.values()):,} chunks, {len(chunks):,} distinct")

        for i in range(n_merges):
            counts = count_pairs(chunks)
            if not counts:
                break
            pair = max(counts, key=counts.get)
            new_id = 256 + i
            self.merges[pair] = new_id
            self.vocab[new_id] = self.vocab[pair[0]] + self.vocab[pair[1]]
            # apply the merge only to chunks that contain the pair
            chunks = {
                (merge(ids, pair, new_id) if pair in zip(ids, ids[1:]) else ids): n
                for ids, n in chunks.items()
            }
            if log:
                log(f"merge {i + 1:4d}: {self.vocab[pair[0]]!r} + {self.vocab[pair[1]]!r} -> {self.vocab[new_id]!r}  ({counts[pair]:,} times)", i)

        self.special[EOT] = 256 + n_merges

    # --- encoding and decoding --------------------------------------------

    def _encode_chunk(self, chunk):
        if chunk in self._cache:
            return self._cache[chunk]
        ids = tuple(chunk.encode("utf-8"))
        while len(ids) > 1:
            # of all pairs present, merge the one that was learned earliest
            pairs = set(zip(ids, ids[1:]))
            pair = min(pairs, key=lambda p: self.merges.get(p, float("inf")))
            if pair not in self.merges:
                break
            ids = merge(ids, pair, self.merges[pair])
        self._cache[chunk] = ids
        return ids

    def encode(self, text):
        """Text -> list of token ids. <|endoftext|> in the text becomes its special id."""
        ids = []
        for i, part in enumerate(text.split(EOT)):
            if i > 0:
                ids.append(self.special[EOT])
            for m in self._split.finditer(part):
                ids.extend(self._encode_chunk(m.group()))
        return ids

    def decode(self, ids):
        """Token ids -> text."""
        out = []
        for i in ids:
            if i in self.vocab:
                out.append(self.vocab[i])
            elif i == self.special.get(EOT):
                out.append(EOT.encode())
        return b"".join(out).decode("utf-8", errors="replace")

    def pieces(self, text):
        """The tokens of `text` as readable strings, for looking at."""
        return [self.decode([i]) for i in self.encode(text)]

    # --- files ------------------------------------------------------------

    def save(self, path):
        with open(path, "w") as f:
            json.dump({
                "pattern": SPLIT_PATTERN,
                "merges": [[a, b, c] for (a, b), c in self.merges.items()],
                "special": self.special,
            }, f)

    @classmethod
    def load(cls, path):
        with open(path) as f:
            d = json.load(f)
        t = cls()
        for a, b, c in d["merges"]:
            t.merges[(a, b)] = c
            t.vocab[c] = t.vocab[a] + t.vocab[b]
        t.special = d["special"]
        return t

    def truncated(self, vocab_size):
        """A smaller tokenizer: the same training, stopped at `vocab_size`. For comparing sizes."""
        t = Tokenizer()
        for (a, b), c in self.merges.items():
            if c >= vocab_size - 1:
                break
            t.merges[(a, b)] = c
            t.vocab[c] = t.vocab[a] + t.vocab[b]
        t.special = {EOT: vocab_size - 1}
        return t
