# The plan — fourteen steps from a tokenizer to RLVR

Each step: what gets built, what Bart will understand at the end of it, and
what he will see when it works. A step is built only after it is signed off.
Status is one of: **not started · approved · building · done · skipped**.

| # | Step | The idea | Status |
|---|------|----------|--------|
| 0 | Environment | Python, PyTorch on Apple silicon, the repo layout | done 2026-10-12 (iMac + mini) |
| 1 | Backpropagation from scratch (micrograd) | The chain rule, written as code | done 2026-10-12 |
| 2 | Tokenizer (BPE) | How text becomes numbers | done 2026-10-12 (vocab 8,192) |
| 3 | The dataset and the training objective | Next-token prediction is the whole game | done 2026-10-12 (100.1 M tokens) |
| 4 | The simplest language model (bigram) | Embeddings, logits, softmax, cross-entropy | done 2026-10-12 (loss 9.0 → 4.2) |
| 5 | Attention and the Transformer block | How tokens look at each other | done 2026-10-12 (one block: 3.72 vs bigram 4.19) |
| 6 | Pretraining the GPT | Random weights become a language model | done 2026-10-13 (10.1 M params, 3.1 h on the mini, loss 9.07 → 2.08) |
| 6b | Pretraining on Usenet alone | Out with the kids, in with Usenet: 1981–1991 from archive.org, new tokenizer, same model | done 2026-10-14 (1.88 M posts, 497 M tokens, 7.8 h, loss 9.06 → 3.37) |
| 7 | Looking at the weights | The embedding table before and after | done 2026-10-15 (Usenet model; 7 of 8 analogies right) |
| 8 | The conversion bridge | Our model as a Hugging Face model | skipped 2026-10-16 (post-training is hand-written on our own model, so nothing needs the HF format) |
| 9 | SFT | Pretraining again, on conversations, with a mask | done 2026-10-16 (2,945 Usenet-era Q&A pairs, 90 s; answers in shape, facts wrong) |
| 10 | DPO | Preference alignment without a reward model | not started |
| 11 | Reward model + PPO (optional) | The original RLHF recipe | not started |
| 12 | RLVR with GRPO | Reinforcement learning against a checker | not started |
| 13 | Scale up (optional) | The same pipeline at GPT-2 124M | not started |

Steps 1–6 follow Karpathy's "Neural Networks: Zero to Hero" (micrograd,
makemore, minbpe, nanoGPT). Steps 9–12 are written by hand on our own model,
in plain PyTorch, with no TRL; that is why step 8 (the conversion to a Hugging
Face model, which only TRL needed) was skipped on 2026-10-16.

---

## 0 · Environment

**Build:** a Python virtual environment with PyTorch, numpy, matplotlib,
scikit-learn; a check that a matrix multiply runs on the `mps` device; the
folder layout (`NN-name/` per step, `data/`, `out/`).

**Understand:** where the computation runs and how to tell.

**See:** `torch.backends.mps.is_available()` is true and a 4096×4096 matmul
runs faster on `mps` than on `cpu`.

Mechanical; no learning in it. Done together with step 1.

## 1 · Backpropagation from scratch (micrograd)

**Build:** a `Value` class holding a number and its gradient, with `+`, `*`,
`tanh`, `exp`, `pow`, and a `backward()` that walks the graph in reverse
applying the chain rule. Then a tiny neural net (neuron → layer → MLP) out of
those values, trained with gradient descent on a handful of points.

**Understand:** what a gradient is, what the chain rule does when the graph
is a web of operations, why `loss.backward()` and `optimizer.step()` are not
magic. This is the one mechanism every later step relies on.

**See:** the graph of one expression drawn with every node's value and
gradient; the MLP's loss falling over 20 iterations, and its predictions
matching the targets.

About 150 lines of Python. One session.

## 2 · Tokenizer (BPE)

**Build:** byte-pair encoding from scratch: start with 256 byte tokens,
count the most frequent adjacent pair, merge it into a new token, repeat
until the vocabulary is the size we want (a few thousand). `encode(text)`,
`decode(ids)`, and the saved merge table. Trained on the corpus from step 3
(TinyStories), so this step also downloads it.

**Understand:** why models see tokens rather than characters or words, why
"king" ends up as one token and a rare word as four, where the vocabulary
size trades off against sequence length.

**See:** the merges happening in order (" the", "ing", " king"); a sentence
encoded and decoded back; the token count of the corpus at several
vocabulary sizes.

A few hundred lines. One session.

## 3 · The dataset and the training objective

**Build:** the whole corpus tokenized once into a flat array of integers on
disk; a `get_batch()` that picks random windows and returns `x` (a window)
and `y` (the same window shifted one token right); a train/validation split.

**Understand:** the entire training signal is "given these tokens, what is
the next one". Everything the model will know, it learns from this.

**See:** one batch printed as tokens and as text, with the targets lined up
under the inputs.

Short. Half a session, probably done with step 2.

## 4 · The simplest language model (bigram)

**Build:** a model with one weight matrix: a lookup table from the current
token to a row of logits over the next token. Train it with cross-entropy on
step 3's batches. Sample from it.

**Understand:** embeddings as a lookup table, logits, softmax, cross-entropy
as "negative log probability of the right answer", sampling from a
distribution, and what the loss number means (it starts near
`ln(vocab_size)` and a perfect model would be at zero).

**See:** the loss drop from random to a plateau; generated text that is
nonsense but has the letter and word statistics of the corpus.

Short. One session.

## 5 · Attention and the Transformer block

**Build:** one attention head by hand — queries, keys, values, the scaled dot
product, the causal mask, softmax, the weighted sum. Then multi-head
attention, the MLP, layer norm, residual connections, and one Transformer
block that stacks them.

**Understand:** how a token gathers information from the tokens before it,
why the mask makes it causal, why heads are run in parallel, what the
residual path and layer norm are for.

**See:** the attention weights of one head on one sentence as a heatmap;
the block's output shape; a model with one block beating the bigram loss.

The biggest conceptual step. One or two sessions.

## 6 · Pretraining the GPT

**Build:** the full GPT-2-style model — token and position embeddings, N
blocks, a final layer norm, the output head, about 10M parameters. AdamW,
a learning-rate warmup and cosine decay, gradient clipping, a training loop
that logs train and validation loss, saves checkpoints, and samples text
every few hundred steps. Train it on TinyStories on `mps`.

**Understand:** what "training a model" means in practice: the loss curve,
what overfitting looks like against the validation set, why the learning
rate schedule exists, how a checkpoint is just a dictionary of tensors.

**See:** the loss curve; samples at step 0 (noise), 500 (words), 2,000
(sentences), 10,000 (little stories). This is the base model every later
step starts from.

Hours of training. One session to set up, then it runs.

## 7 · Looking at the weights

**Build:** scripts that take the embedding table out of a checkpoint and
project it to 2D (PCA, then UMAP) with matplotlib; the same plot from the
step-0 checkpoint and the final one; the nearest neighbours of a few words;
the `king − man + woman ≈ queen` probe.

**Understand:** what the weights learned — that geometry in the embedding
space encodes meaning, and that it was not there before training.

**See:** a random cloud before, clusters after, `king` / `queen` / `man` /
`woman` labelled on both. The analogy may only gesture at the answer at this
scale; the before/after difference will be plain.

One session.

## 8 · The conversion bridge

**Skipped 2026-10-16.** It only existed so TRL's trainers could load the
model. Post-training is hand-written on our own model instead, so nothing
needs the Hugging Face format. Kept here for the record.

**Build:** a script that builds a Hugging Face `GPT2LMHeadModel` with our
config, copies our checkpoint's tensors into it (a few weights transposed),
saves it in HF format together with our tokenizer, and checks that both
models produce the same logits for the same input.

**Understand:** a model is its config plus a dictionary of tensors; HF is a
container around the same thing, and the post-training tools accept that
container.

**See:** `max |logits_ours − logits_hf| < 1e-4`; the same sample from both.

About 100 lines. Half a session.

## 9 · SFT

**Build:** a synthetic instruction–response dataset in a narrow domain the
model can learn (chosen at sign-off: short questions about 1985–1991
computing, answered in a Usenet regular's voice, written by Claude); a chat format with special
tokens; a loss mask so only the response tokens count; the training loop is
step 6's loop with the mask.

**Understand:** SFT is pretraining on a different dataset with a mask — not
a different kind of learning. Why the format and the mask matter.

**See:** the base model continues the question with more story; the SFT
model answers it.

One session plus a short training run.

## 10 · DPO

**Build:** synthetic preference pairs (prompt, chosen, rejected — e.g.
answers that are correct and short vs. correct and rambling, or correct vs.
wrong); the DPO loss written out by hand (log-probability ratios of chosen
and rejected under the policy and a frozen reference, through a sigmoid,
scaled by beta) and the training loop around it.

**Understand:** how a model learns a preference without a reward model, why
it needs a frozen reference copy, what beta controls.

**See:** on held-out prompts, the model's preferred completion wins against
the SFT model's more often than not; the reward margin rising during
training.

One session plus a short run.

## 11 · Reward model + PPO (optional)

**Build:** a reward model — the SFT model with a scalar head — trained on the
same preference pairs; then PPO written out: sample completions from the
policy, score them with the reward model, apply a KL penalty against the
reference, update the policy, with a value model alongside.

**Understand:** the original RLHF loop, and why DPO was invented to skip it
(four models in memory, unstable training, many knobs).

**See:** mean reward over training steps; the KL to the reference; samples.

Optional because it is the most moving parts and the least used recipe
today. Worth doing once to feel the difference from DPO.

## 12 · RLVR with GRPO

**Build:** a prompt generator for a verifiable task (two-digit arithmetic,
to start); a verifier that parses the model's answer and returns 1 if it is
correct and 0 otherwise; the GRPO loop written out — sample a group of
completions per prompt, score them, compute each one's advantage relative
to the group, update the policy.

**Understand:** reinforcement learning where the reward is ground truth,
why group-relative advantages remove the need for a value model, and what
"the model learns to reason" means at this scale.

**See:** accuracy on held-out arithmetic rising from near zero; completions
at the start and the end side by side.

One session plus a run.

## 13 · Scale up (optional)

**Build:** the same pipeline with the GPT-2 124M config and a longer
pretraining run, probably on a rented GPU.

**Understand:** what changes with scale and what doesn't.

**See:** better stories, a cleaner `king − man + woman` answer.

Only if steps 1–12 leave the appetite for it.
