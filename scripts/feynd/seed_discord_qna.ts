/**
 * One-shot seed: inserts a "Karpathy — Discord Q&A (2026-04-20)" chat for
 * a given device_id and writes the 8 Q&A pairs we had on Discord that night
 * as message_pair rows. Runs against the Supabase instance directly via
 * the service key (not through the HTTP API) so we can backfill regardless
 * of device headers.
 *
 * Run:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/feynd/seed_discord_qna.ts --device <DEVICE_ID>
 *
 * If --device is omitted, uses the first device that already has a chat in
 * the course; if there are none, uses the literal string "seed-bart-imac"
 * as a placeholder so you can later reassign.
 */

import { createClient } from '@supabase/supabase-js'

const COURSE_ID = 'frontier-ai-2026'
const VIDEO_ID = 'karpathy-dwarkesh-2025-10'
const CHAT_TITLE = 'Discord Q&A while watching Karpathy'

type Pair = { q: string; a: string }

const PAIRS: Pair[] = [
  {
    q: 'What is AlexNet',
    a: `AlexNet is the 8-layer convolutional neural net by Alex Krizhevsky, Ilya Sutskever, and Geoffrey Hinton that won the 2012 ImageNet competition — and basically kicked off the modern deep-learning era.

The setup was 5 convolutional layers + 3 fully-connected layers, ~60M parameters, trained on two GTX 580 GPUs for about a week on 1.2M labeled images. It cut the ImageNet top-5 error rate from ~26% down to ~15.3%, which was a shocking jump at the time — far outside what anyone thought neural nets could do on real images.

What made it matter wasn't one clever trick, it was the stack: (1) deep enough to learn hierarchical features, (2) ReLU activations instead of tanh so training didn't stall, (3) dropout in the FC layers to fight overfitting, (4) data augmentation, and (5) GPUs, which made the whole thing actually trainable. After AlexNet the field pivoted fast — every vision paper suddenly had to be a deep conv net, and within a couple of years the same playbook (plus scale) jumped to speech, then language.

tl;dr: AlexNet is the "2012 big bang" paper. Karpathy's Dwarkesh interview references it as one of the moments that shifted the whole field.`,
  },
  {
    q: 'Explain the weights in an LLM model',
    a: `Weights are the numbers that actually *are* the model. Everything else — the code, the architecture — is just a recipe for how to multiply these numbers against your input.

**What they are, concretely.** Inside an LLM you have stacks of matrices. Each matrix is just a grid of floating-point numbers. When you hear "70B parameter model" that's 70 billion numbers sitting in those matrices. They live on disk as a big file (e.g. the Llama-3 70B weights are about 140 GB), loaded into GPU memory at inference time.

**Where they sit in a transformer.** Each layer has a few kinds of weight matrices:
• **Embedding matrix** — turns token IDs into vectors (e.g. the token "dog" becomes a 4,096-dim vector)
• **Attention weights** — four matrices per layer (Q, K, V, O) that decide which earlier tokens each token should "look at"
• **Feed-forward weights** — two matrices per layer (up-projection and down-projection) that do the actual "thinking" on each token
• **LayerNorm / bias terms** — small tuning knobs that keep activations stable
• **Unembedding matrix** — at the very end, converts the final vector back into probabilities over the vocabulary

A 32-layer model just stacks those same kinds of matrices 32 times, each with its own learned values.

**How they get their values.** During pretraining the model sees trillions of tokens and tries to predict the next one. Every time it's wrong, backpropagation computes which weights should be nudged up and which down to make it less wrong next time. Do that a few hundred billion times and the weights settle into a configuration that encodes an enormous amount of statistical structure about language (and code, math, reasoning patterns…). Post-training (SFT, RLHF, RLVR) then nudges a small fraction of those weights further so the model is *useful*, not just a raw text predictor.

**What they "contain."** No single weight means anything on its own. Meaning is distributed — a concept like "Paris is the capital of France" doesn't live at one address, it's encoded across thousands of weights whose combined effect makes the model output "Paris" when you ask. Mechanistic interpretability is the field trying to reverse-engineer what specific patterns of weights are doing.

tl;dr: a pile of billions of numbers, arranged in matrices, found by gradient descent, that collectively know how to continue a piece of text.`,
  },
  {
    q: 'Explain gradient descent',
    a: `Gradient descent is how you get from "here's a pile of random numbers" to "here's a trained model." It's the algorithm that actually nudges those weights in the right direction, billions of times in a row.

**The picture.** Imagine all the weights of the model as coordinates in a very high-dimensional space — a 70B model lives in 70-billion-dimensional space. At every point in that space there's a "loss" value: how wrong is the model, right now, on the data it just saw? Plot loss over that space and you get a landscape with hills and valleys. Training = trying to walk downhill to a low valley.

**The algorithm, in one breath.**
1. Show the model a batch of training examples.
2. Compute how wrong it was (the loss — usually: "how much probability did you put on the actual next token? not enough, here's the bill").
3. For each weight, compute the *gradient* — a number that says "if you nudge this weight up by a tiny amount, does loss go up or down, and by how much?" Gradient is literally the slope of the loss surface with respect to that weight.
4. Update every weight by a tiny step in the *opposite* direction of its gradient. (Uphill → gradient positive → step down.) The step size is called the **learning rate**, usually something like 0.0001.
5. Repeat. A few hundred billion times.

The magic that makes step 3 tractable for billions of weights is **backpropagation** — the chain rule from calc, applied mechanically, letting you compute every gradient in one backward pass through the network after one forward pass. Without backprop, training a modern model would be computationally impossible.

**What "stochastic" means.** You don't compute the gradient over the whole dataset before each step — that'd be too slow. You grab a mini-batch (say, a few million tokens), compute gradients on just that, take a step, grab the next batch. Noisy but fast. That's **stochastic gradient descent** (SGD). Real training usually uses a smarter variant like **Adam** or **AdamW**, which keeps a running estimate of how each weight's gradient has been trending and adjusts step sizes per-weight.

**The walking-in-the-fog analogy.** You're on a mountain in dense fog. You can't see the whole landscape, but you can feel which direction is steepest downhill under your feet. So you take a step that way. Then you check again. Then again. Millions of times. You can't *guarantee* you'll find the deepest valley — you might end up in a local dip — but in very high dimensions that turns out to be mostly okay, for reasons that are still kind of mysterious.

tl;dr: "Walk downhill on the loss landscape, a tiny step at a time, by feeling the slope under your feet." The slope-feeling is backprop. Scale that up with enormous compute and enormous data and you get GPT-style models.`,
  },
  {
    q: 'What is in-context learning',
    a: `In-context learning is the thing that made LLMs feel *magical* when GPT-3 first came out. It's this: you give the model a few examples in the prompt, and without any retraining, it figures out the pattern and applies it to a new case.

**What it looks like.**
\`\`\`
English: dog → French: chien
English: house → French: maison
English: apple → French:
\`\`\`
The model outputs "pomme." You never trained it on *that specific prompt format*, you never said "translate English to French," and critically **no weights changed**. The exact same model, given the exact same prompt with "Italian" instead of "French," would spit out "mela." The "learning" happens entirely inside the forward pass.

**Three flavors.**
- **Zero-shot:** just describe the task in words. ("Translate to French: apple") — works for easy stuff.
- **Few-shot:** give 2–10 worked examples, then the new input. Dramatically better on harder tasks.
- **Chain-of-thought:** include examples where the reasoning is written out step by step. Model imitates that and reasons through its own answer. This is the trick that unlocked grade-school math on GPT-3.5 and later became o1/o3-style deliberate reasoning.

**Why it's weird.** Normally in ML, "learning" means updating weights via gradient descent. But here the weights are frozen — the model is doing something that *looks* like learning using only its forward pass and the prompt as scratch space. That's why it was a genuine surprise when it emerged from GPT-3. It wasn't really designed in; it fell out of scaling.

**What's actually happening under the hood.** Anthropic and DeepMind interpretability work has shown the key mechanism is a pattern called **induction heads** — attention heads that learn to copy patterns from earlier in the context. Basically: "I saw \`A → B\` earlier in the prompt. Now I see \`A\` again. Predict \`B\`." Stack a bunch of those and you get something that can imitate any pattern it sees, which is 90% of what in-context learning *feels* like. Plus the model's pretrained knowledge, which lets it fill in sensible generalizations when the pattern is fuzzy.

**Why it matters for practice.**
- It's why prompting is a real skill: examples, format, and framing can swing quality more than picking a bigger model.
- It's why "prompt engineering" exists as a discipline.
- It's why tool use + RAG + long context are so powerful: you're not teaching the model anything new, you're giving it the right context so its in-context learning can do the work.

tl;dr: LLMs can infer a task from examples in the prompt, with zero weight updates. It's pattern-matching at inference time, powered largely by induction heads that learned to copy structure they've seen nearby.`,
  },
  {
    q: 'What are transformers',
    a: `Transformers are the neural-net architecture every frontier LLM is built on. Introduced in the 2017 Google paper "Attention Is All You Need" — the snarky title because at the time everyone was using recurrent nets (LSTMs, GRUs) for sequences, and the authors said: throw that out, you only need attention.

**The job they do.** Take a sequence of tokens in, produce a sequence of vectors out where each vector has "absorbed" relevant context from every other position. Stack enough of those layers and each token's vector ends up encoding a huge amount of the document's meaning. For an LLM, you then project the final vector to a probability distribution over the next token.

**The key trick: self-attention.** At every layer, each token asks every other token in the context a question and decides how much to pay attention to each answer. Concretely, for each token you compute three vectors — a **Query** (what am I looking for?), a **Key** (what do I offer?), and a **Value** (what info do I contribute?). You dot every Query against every Key to get attention scores, softmax them into weights, then take a weighted sum of the Values. Result: every token pulls in exactly the info from other positions that's most relevant to it.

That's radical because older architectures (RNNs, LSTMs) had to pass information through the sequence one step at a time — meaning the word at position 500 sees position 1 only through 499 intermediate squeezes. In a transformer, position 500 can directly look at position 1 with a single dot product. Also: massively parallelizable, so GPUs can tear through it.

**Multi-head attention.** You don't do attention once per layer, you do it in parallel with ~32–128 different Q/K/V projections ("heads"), each learning to focus on a different kind of relationship — one head might track syntactic agreement, another might track coreference, another the overall topic. Then the heads are concatenated and mixed.

**The other half: MLPs.** After attention, each token passes through a feed-forward network (two linear layers with a nonlinearity). Attention moves information *between* tokens; MLPs do the actual "thinking" *on* each token. Modern mechanistic-interp research argues the MLPs are where most of the stored *knowledge* lives (Paris = capital of France etc.), while attention is the *routing*.

**Stack the block, add positions.** A transformer layer = attention + MLP, with residual connections and layer norms. A modern LLM stacks 32 to 120 of these. Positions are encoded via rotary embeddings (RoPE) or learned position vectors, since the architecture itself is order-blind.

**Why they won.**
1. **Parallel.** Every position is computed simultaneously, no sequential bottleneck → trains way faster on GPUs.
2. **Long-range.** Any position can attend to any other directly.
3. **Scales beautifully.** Bigger = monotonically better, for a surprisingly long time. That's the whole scaling-laws story.
4. **Universal.** Same architecture works for text, code, images (ViT), audio, proteins (AlphaFold), video, robotic control. Basically one hammer for every sequence.

**Variants you'll hear about.**
- **Decoder-only** (GPT, Llama, Claude) — attention is causally masked so each token only sees past tokens. Used for generation.
- **Encoder-only** (BERT) — no mask, bidirectional. Used for classification/embedding.
- **Encoder-decoder** (T5, original paper) — for translation-style tasks.
- **Mixture of Experts** — swap the MLP for a bank of MLPs and route each token to a few, so you scale parameters without scaling per-token compute. This is how most 2025–2026 frontier models get huge.

tl;dr: a transformer is self-attention (every token looks at every other token, weighted by learned relevance) + MLPs (per-token processing), stacked 30-ish layers deep, trained with gradient descent on a next-token prediction loss. Every major AI model you've heard of in the last three years is some variant of this.`,
  },
  {
    q: 'What is a LoRA',
    a: `LoRA = **Low-Rank Adaptation**. It's the trick that made fine-tuning big models affordable — the reason any random person with one GPU can customize Llama or Stable Diffusion.

**The problem it solves.** Full fine-tuning of a 70B model means you need to update all 70B weights. That in turn means storing optimizer state for every weight (Adam keeps ~2 extra floats per weight), which balloons into hundreds of gigabytes of GPU memory — way beyond a single card. Plus you end up with a 140 GB file per fine-tuned variant.

**The insight.** Hu et al. at Microsoft in 2021 noticed: when you fine-tune a pretrained model, the *change* in the weights (ΔW) tends to be **low-rank**. You're not reshaping the model from scratch, you're nudging it in a few coherent directions. So instead of learning a full ΔW matrix of size (d × k), approximate it as the product of two skinny matrices:

\`\`\`
ΔW ≈ A @ B
\`\`\`

where \`A\` is \`(d × r)\` and \`B\` is \`(r × k)\`, with \`r\` tiny — often 8, 16, maybe 64. Freeze the original \`W\`; only train \`A\` and \`B\`.

**Why that's huge.** For a 4096×4096 weight matrix (~16.8M params), a rank-16 LoRA is just 4096×16 + 16×4096 = 131K params. **~0.8% of the original**. Scale that across the whole model and you're fine-tuning a 70B model by training ~70M parameters. Fits on a single consumer GPU. The resulting "LoRA file" is maybe 100-300 MB instead of 140 GB.

**At inference.** Two options:
1. Compute \`W @ x + (A @ B) @ x\` — keeps LoRA as a separate small adapter.
2. Merge: replace \`W\` with \`W + A @ B\` once, then run normally. Zero inference overhead vs the original model.

**What people actually do with it.**
- **Personalities / styles.** "Make this model talk like my brand." Train a LoRA on your corpus, done.
- **Task specialization.** Code LoRAs, medical LoRAs, SQL LoRAs.
- **Stable Diffusion character / style LoRAs.** That whole CivitAI ecosystem is LoRAs — a tiny adapter that makes the base model draw one specific character or art style.
- **Swappable adapters.** Keep one big base model in GPU memory, swap LoRAs at request time to serve many different fine-tuned variants cheaply.

**Variants worth knowing.**
- **QLoRA** — quantize the frozen base model to 4-bit so it fits in way less memory, then train LoRA on top. This is the trick that made single-GPU Llama fine-tuning a real thing.
- **DoRA, LoHa, LoKr, etc.** — cleverer decompositions that squeeze more quality out per trainable parameter. Mostly incremental.

**Where it fits in the post-training stack.** In a frontier lab's pipeline (pretrain → SFT → RLHF → RLVR), the early pretraining is full-rank because you're actually trying to rewrite capabilities. But SFT and preference-tuning stages are often done via LoRA-style low-rank updates, especially for smaller experiments or per-customer fine-tunes. The big labs do full fine-tunes for their production models, but the open-source ecosystem runs on LoRA.

tl;dr: freeze the big weights, learn a small low-rank "diff" on top. Fine-tune a massive model by training <1% of its parameters. The reason consumer-GPU fine-tuning, character LoRAs, and cheap adapter-multiplexed inference all exist.`,
  },
  {
    q: 'What are embeddings',
    a: `Embeddings are how you turn *anything discrete* — a word, a sentence, an image, a user, a product — into a list of numbers that captures its meaning. Once you have numbers, you can do math: measure similarity, cluster, search, feed into a neural net. Before you have numbers, you've got strings and GPUs don't care about strings.

**The basic move.** Pick a dimension, say 1,024. Assign each thing a vector in ℝ^1024 such that **similar things live near each other** and dissimilar things live far apart. "King" and "queen" should be close. "King" and "stapler" should be far. Distance is usually cosine similarity (angle between the vectors) or plain Euclidean.

**The famous example.** Trained word embeddings encode relationships as *directions*:
\`\`\`
vec("king") − vec("man") + vec("woman") ≈ vec("queen")
vec("Paris") − vec("France") + vec("Italy") ≈ vec("Rome")
\`\`\`
Gender, capital-of, tense, plurality — each becomes roughly a direction in the space, learned from co-occurrence statistics. This was the 2013 Word2Vec paper's big "ohhh" moment.

**Inside an LLM.** That embedding matrix is literally a lookup table: \`(vocab_size × hidden_dim)\`. Token ID 4,281 ("dog") grabs row 4,281 and that vector becomes the input to the transformer stack. The model's first job every forward pass is "convert sparse discrete token IDs into dense continuous vectors we can actually do math on." The last layer runs the reverse transformation (the unembedding) to turn the final vector back into probabilities over tokens.

Everything in between is the transformer *reshaping those embeddings* based on context so "bank" in "river bank" ends up in a very different region of the space than "bank" in "deposit at the bank."

**Token vs. sentence vs. document embeddings.**
- **Token embeddings:** one vector per token, what goes into the transformer.
- **Contextual embeddings:** the hidden state at any layer — the token's vector *after* attention has mixed in context from the rest of the sequence. These are what modern "sentence embedding" APIs actually return (they pool the last-layer hidden states).
- **Sentence / document embeddings:** one vector summarizing a whole chunk of text. Produced by purpose-trained encoder models (e.g. OpenAI text-embedding-3, Cohere Embed, BGE, E5). Used for RAG, search, clustering.

**Embeddings for other modalities.**
- **Image embeddings** (CLIP, SigLIP) — one vector per image, trained so images and their captions end up near each other. This is why you can text-search an image library.
- **Audio, video, proteins, code, users, products** — same recipe, same geometry, different training signal.

**Multimodal embeddings.** CLIP's trick: train a text encoder and image encoder jointly so that a photo of a dog and the string "a dog" map to nearby vectors. Now "image search by text" is just a dot product. That shared-space idea is the foundation of every modern text-to-image / text-to-video system.

**Why they matter for RAG and retrieval.** RAG ("retrieval-augmented generation") works like this: embed every chunk of your knowledge base; embed the user's question; find the chunks whose embeddings are closest; paste those chunks into the prompt. The whole thing hinges on embeddings being a good *measure of semantic similarity*.

tl;dr: embeddings = dense vectors in a learned geometric space where similarity = proximity. Inside LLMs they're the input/output pipework. Outside LLMs they're the substrate for search, RAG, clustering, recommendation, and every cross-modal model.`,
  },
  {
    q: 'In the Karpathy video, he talks about a step in tuning where giving the model examples of conversation makes it much better at conversation. What is that and how does it work?',
    a: `That's **supervised fine-tuning (SFT)**, and Karpathy is specifically pointing at the 2022 **InstructGPT** paper as the one that blew his mind.

Here's the actual quote from the transcript: *"The paper that blew my mind was InstructGPT, because it pointed out that you can take the pretrained model, which is autocomplete, and if you just fine-tune it on text that looks like conversations, the model will very rapidly adapt to become very conversational, and it keeps all the knowledge from pre-training."*

**What's happening.** A pretrained base model is pure autocomplete. Show it "Dear Senator," and it'll write a letter. Show it "once upon a time," and it'll write a story. It has no concept of being a helpful assistant answering questions — those aren't the kinds of documents it was trained on, so it doesn't default to producing them.

SFT fixes this by continuing training (same gradient-descent loop) but on a **curated dataset of conversations**. The dataset looks like:

\`\`\`
User: What's the capital of France?
Assistant: Paris.

User: Can you summarize the paper I pasted below?
Assistant: Sure. The authors argue that...
\`\`\`

A few tens of thousands of these, written by human labelers (originally at OpenAI, now often a mix of humans + other models + synthetic pipelines). The model gets the User turn as context and is trained to predict the Assistant turn, token by token, same as during pretraining. Loss function hasn't changed. Optimizer hasn't changed. Just the *distribution of data* changed.

**Why it works so fast.** You don't need to retrain the model. You just need to **nudge its weights slightly** so it now puts higher probability on "assistant-reply-looking continuations" when it sees "User:"-style context. The model already learned everything it knows about the world during pretraining — facts, reasoning, language — SFT doesn't teach it new facts, it teaches it a **format** and a **role**. Which turns out to require remarkably few examples and a tiny number of training steps compared to the trillions of tokens of pretraining.

Karpathy's phrase: *"the model will very rapidly adapt to become very conversational, and it keeps all the knowledge from pre-training."* That "keeps all the knowledge" is the magic. You're not re-teaching it; you're unlocking a behavior that was latent.

**Where SFT sits in the full post-training pipeline.** Modern frontier models go through roughly four stages:

1. **Pretraining** — trillions of tokens of web/book/code text, next-token prediction. Produces a base model that's great at autocomplete but useless as a chatbot.
2. **SFT (what Karpathy is describing)** — fine-tune on ~tens of thousands of ideal human-written Q&A examples. Base model → "instruction-following chatbot."
3. **RLHF / preference tuning** — show the model two answers, have humans rank which is better, train a reward model, RL-tune the main model to maximize predicted human preference. Makes it helpful, harmless, and pleasant. (Karpathy uses a colorful metaphor about RL being "sucking supervision bits through a straw" because you only get one scalar reward per long completion.)
4. **RLVR / RL with verifiable rewards** — the 2024–2026 addition. For tasks where you can automatically check correctness (math, code, puzzles), you skip human labelers and use the verifier as the reward. This is what gave us o1/o3/DeepSeek-R1 and the current reasoning-model boom.

SFT is the hinge between pretraining (raw knowledge) and RL (preference sculpting + reasoning). It's what converts "oracle of the internet" into "chatbot that takes instructions."

**Why he calls it miraculous.** Before InstructGPT, the intuition would have been: "to teach a model to be a conversational assistant, you have to train it from scratch on conversational data." InstructGPT showed: nope, a few thousand examples layered on top of a general pretrained base gets you 90% of the way there, keeps all the general knowledge intact, and leaves headroom for RL to polish the rest. That decoupling — **one expensive pretraining run + cheap behavioral fine-tuning** — is the whole economic shape of how frontier labs operate today.

tl;dr: what you're asking about is **supervised fine-tuning**, done on curated conversation transcripts. It's not teaching the model new facts, it's teaching it a role. The "blew my mind" part is that a tiny amount of this goes a very long way, because the base model already had all the capability latent — SFT just unlocks it.`,
  },
]

async function main() {
  const deviceArg = process.argv.find((a, i, arr) => arr[i - 1] === '--device')
  const deviceId = deviceArg || 'seed-bart-imac'

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL or SUPABASE_SERVICE_KEY not set')
    process.exit(1)
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })

  // Idempotency: delete any existing chat with the exact seed title for this
  // device so reruns don't pile up.
  const { data: existing } = await sb
    .from('feynd_chats')
    .select('id')
    .eq('device_id', deviceId)
    .eq('course_id', COURSE_ID)
    .eq('video_id', VIDEO_ID)
    .eq('title', CHAT_TITLE)
  if (existing && existing.length > 0) {
    const ids = existing.map((r) => r.id)
    await sb.from('feynd_chats').delete().in('id', ids)
    console.log(`cleared ${ids.length} prior seed chat(s)`)
  }

  // Build the messages jsonb array (messages live inline in feynd_chats now).
  const now = new Date()
  const messages: Array<Record<string, unknown>> = []
  let t = now.getTime() - (PAIRS.length * 2 * 1000) // stagger timestamps backward
  for (const p of PAIRS) {
    messages.push({
      id: crypto.randomUUID(),
      role: 'user',
      text: p.q,
      source: 'discord',
      audio_url: null,
      created_at: new Date(t).toISOString(),
    })
    t += 500
    messages.push({
      id: crypto.randomUUID(),
      role: 'assistant',
      text: p.a,
      source: 'discord',
      audio_url: null,
      created_at: new Date(t).toISOString(),
    })
    t += 500
  }

  const { data: chat, error: chatErr } = await sb
    .from('feynd_chats')
    .insert({
      device_id: deviceId,
      course_id: COURSE_ID,
      video_id: VIDEO_ID,
      title: CHAT_TITLE,
      messages,
    })
    .select('id')
    .single()
  if (chatErr || !chat) {
    console.error('Chat insert failed:', chatErr)
    process.exit(1)
  }
  console.log(`created chat ${chat.id} with ${messages.length} messages (${PAIRS.length} Q&A pairs) for device ${deviceId}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
