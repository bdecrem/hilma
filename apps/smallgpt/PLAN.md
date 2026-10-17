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
| 9 | SFT | Pretraining again, on conversations, with a mask | done 2026-10-16 (2,945 Usenet-era Q&A pairs, 90 s; answers in shape, facts wrong. 9b: the cranky hacker, 3,206 real Usenet questions + replies; runs in the browser at ola.cx/smallgpt/chat) |
| 10 | DPO | Preference alignment without a reward model | not started (step 11 chosen instead, 2026-10-16) |
| 11 | Reward model + PPO | The RLHF recipe: a judge, then reinforcement learning | done 2026-10-17 (on the 92M model: 11,521 Claude-judged pairs, reward model 81% agreement, PPO with the leash at 0.2 wins 72% against SFT judged blind by Claude; without the leash the reward model is gamed and it wins 26%) |
| 12 | RLVR with GRPO | Reinforcement learning against a checker | not started (next) |
| 13 | Scale up | The same pipeline at GPT-2 small's shape (~92M), on rented GPUs | done 2026-10-17 (moved before 10–12; 91.7M params, 4 passes over 6b's data, 9.1 min on 8 H100s on Together, val 3.37 → 2.80; cranky SFT on it; the chat page's default) |

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

## 11 · Reward model + PPO — done 2026-10-17

Built as planned in `11-rlhf/`; results in its README. Changes from the plan: Claude scored answers 1–10 instead of ranking them, so equal scores make no pair (11,521 pairs, not 6 per question); the leash had to be 0.2, since at 0.05 the reward model was gamed by round 50.

**Chosen over step 10 on 2026-10-16:** a judge plus reinforcement learning is
what frontier labs do for preferences, and it builds the parts step 12 reuses
(the model writing its own answers, a score, an update toward the high
scorers). DPO stays in the table for later.

Starts from the cranky hacker on the bigger model of step 13, which runs first. Four parts, one
folder `11-rlhf/`.

**a · Preferences, judged by Claude (RLAIF).** Take ~2,000 real Usenet
questions from `threads.jsonl` that SFT never saw. The cranky model writes
four answers to each. Claude ranks each set of four against the real replies
the question got: answers the question, agrees with the replies, says it
once and stops, stays cranky. Every ranked set gives six better/worse pairs,
~12,000 in all. This is how labs make preference data today: an AI judge with
written rules in place of human raters.

**b · The reward model.** A copy of the SFT model with its last layer (8,194
token scores) swapped for one number: how good is this answer. Trained on the
pairs with one loss: the better answer's score should beat the worse one's
(−log sigmoid(r_better − r_worse)). Checked on held-out pairs: how often it
agrees with Claude.

**c · PPO.** The loop: pick a batch of questions, the model answers them,
the reward model scores each answer, a penalty is subtracted for drifting
from the frozen SFT copy (the KL), a value model guesses the score
token by token so each token gets its share of the credit, and the policy is
nudged toward the answers that beat the guess, with a clip so no update is
too large. Four models in memory: policy, frozen reference, reward model,
value model (~370 MB each in float32; with the optimizer, a few GB on the mini).

**d · Did it get better?** Claude judges the SFT model against the RLHF
model on 200 held-out questions, blind and in random order: a win rate,
judged by something other than the reward model being optimized.

**Understand:** the full RLHF loop as labs run it; what the reward model is
(a learned stand-in for the judge); why the KL leash exists; reward hacking
(the model finding what the reward model likes rather than what is good,
which we should get to watch happen when the leash is loose).

**See:** reward model accuracy on held-out pairs; mean reward, KL and answer
length over the run; the same questions answered before and after; the win
rate. The RLHF model goes on ola.cx/smallgpt/chat as a third choice.

About 20 minutes of Claude calls for the pairs, minutes for the reward
model, under an hour for PPO. One or two sessions.

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

## 13 · Scale up — done 2026-10-17, before 10–12

**Moved up on 2026-10-16.** The 10M model's answers are near gibberish, and
post-training can only choose among things the model can already do, so
RLHF and RLVR on it would show little. They run on the bigger model instead.

**Model:** GPT-2 small's shape: 12 layers, 12 heads, vectors of 768, windows
of 512 tokens (a Usenet post averages ~260). Our tokenizer stays (8,192 plus
the two chat tokens), so it is ~92M parameters; GPT-2 is 124M only because
its vocabulary is 50k.

**Data:** the same 497M Usenet tokens from 6b, about four passes (~2B
tokens; the rule of thumb is 20 tokens per parameter). Repeating data four
times costs almost nothing against fresh data.

**Build:** `13-scale/train.py`, step 6's loop plus what a GPU run needs:
attention for all heads in one fused call (flash attention), bfloat16,
`torch.compile`, and eight GPUs splitting each batch (DDP). Rehearsed at
home first: a tiny config on the Mac, the eight-GPU path on CPU, so the
cluster hour is only the run.

**Where:** Together AI, one 8×H100 node on demand (Slurm). Upload
`train.bin` (~1 GB) and the script, run ~15–20 minutes, download
`final.pt`, shut the node down. ~$23–32 an hour for the node, about an hour
on the meter with setup: $25–40 of the $50 on the account.

**Then, on the mini:** SFT again on the cranky data (minutes), and the chat
page switches to the bigger model (~95 MB int8, ~0.1 s per token in the
browser). Steps 11 and 12 start from this model.

**Understand:** what scale buys and what it doesn't; what a real GPU run
looks like: several GPUs in step, mixed precision, a node billed by the
minute.

**See:** the loss curve against the 10M model's (3.37); the five questions
of the step 11 example pairs answered by both models; base model samples
side by side.

One session to build and rehearse, one to run.
