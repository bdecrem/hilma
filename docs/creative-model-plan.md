# Plan v2: Build a Raw, Unfiltered Creative Writing Model

## Context
Inspired by the Atlantic article "The Human Skill That Eludes AI" — modern LLMs lost the creative weirdness of GPT-2/3 because RLHF and safety training made them rigid. Goal: build a model whose superpower is raw, unfiltered creativity.

**v1 learnings (2026-03-20):** We rushed a LoRA fine-tune with 91 passages on Llama 3.1 8B base. The model produced mostly generic internet text with occasional literary fragments. The base model's pre-training overwhelmed the fine-tuning. Key mistakes: too little data, wrong training approach (SFT instead of CPT), LoRA only on attention layers, no embedding training.

---

## What We Now Know

### Why GPT-2 felt creative
GPT-2 was a pure base model — next-token prediction on internet text, no RLHF, no safety training. Modern base models (Mistral 7B, Llama 3.1 8B, etc.) share this property. The creativity-killing happens in the instruct/chat variants. Any modern **base** model is a valid starting point.

### What actually works for creative style transfer
Research and case studies point to a clear approach:

1. **Continued Pre-Training (CPT), not Supervised Fine-Tuning (SFT)**
   - CPT = feed raw text, model absorbs style through next-token prediction
   - SFT = teach model to follow instructions in a certain style (not what we want)
   - McCormick (2025) proved CPT with LoRA on 2,500 samples shifted Mistral 7B's entire voice

2. **LoRA on ALL layers, including embeddings**
   - Standard LoRA targets only attention layers — not enough for style transfer
   - For voice/style shift, LoRA must target all linear layers + `embed_tokens` + `lm_head`
   - This is how the model learns new vocabulary patterns and output distributions

3. **Corpus quality >>> corpus size**
   - 200-500 high-quality passages is enough for a strong style shift
   - 91 is viable for proof-of-concept but too thin for production quality
   - The Weaver project (outperformed GPT-4 on creative writing) used curated books filtered by both rules and ML quality checks

4. **Existing creative writing models exist**
   - Weaver (1.8B-34B): purpose-built creative writing LLMs, beat GPT-4
   - hakurei/lit-6B: GPT-J fine-tuned on 2GB of literature
   - Gemma-The-Writer-9B: merge of top storytelling models
   - These prove the approach works. We can learn from their data curation.

---

## The Plan

### Phase 1: Build a Serious Corpus
**Goal:** 500+ passages of the best, weirdest, most alive writing we can find.

**Sources (public domain via Project Gutenberg + open collections):**
- Kafka, Dostoevsky, Woolf, Joyce, Poe, Rimbaud (already have)
- Add: Borges, Clarice Lispector, Flannery O'Connor, Bulgakov, Bruno Schulz
- Poetry: Rilke, Whitman, Dickinson (already have), add Lorca, Celan, Pessoa
- Experimental: Lautréamont, de Quincey, Nerval

**Sources (modern, requires licensing consideration):**
- Denis Johnson, Ted Chiang, Carmen Maria Machado
- Anne Carson, Frank O'Hara, Ocean Vuong
- Hunter S. Thompson, Joan Didion
- Song lyrics with strong imagery

**Curation criteria (scoring from build-corpus.mjs, enhanced):**
- Sensory density (colors, textures, sounds, body)
- Figurative language (metaphor, simile, personification)
- Sentence variety (rhythm, length variation)
- Surprise factor — unexpected word combinations, non-obvious transitions
- Reject: exposition, dialogue-heavy, plot summary, anything that reads like "content"

**Format:** Raw text in JSONL, one passage per line. `{"text": "The full passage..."}` with EOS token.

**Deliverable:** `training-data/corpus-v2.jsonl` — 500+ passages, ~500K tokens

### Phase 2: Train Properly
**Goal:** A model that consistently produces surprising, literary, alive text.

**Experiment matrix (run all, compare):**

| Run | Base Model | Size | Approach | LoRA Config | Est. Cost |
|-----|-----------|------|----------|-------------|-----------|
| A | `mistralai/Mistral-7B-v0.1` | 7B | CPT | r=64, α=128, all layers + embeds | ~$2 |
| B | `meta-llama/Meta-Llama-3.1-8B-Reference` | 8B | CPT | r=64, α=128, all layers + embeds | ~$2 |
| C | `google/gemma-3-12b-pt` | 12B | CPT | r=64, α=128, all layers + embeds | ~$5 |
| D | Best of A/B/C | — | CPT | r=128, α=256, 2 epochs | ~$5 |

**Training config:**
- Approach: Continued Pre-Training (causal LM, raw text)
- LoRA targets: all linear layers + embed_tokens + lm_head
- Epochs: 1-2 (small dataset, avoid memorization)
- Learning rate: 5e-5 (5e-6 for embeddings if configurable)
- Dropout: 0.1 (regularization for small dataset)
- Scheduler: cosine with warmup ratio 0.1
- train_on_inputs: true (this IS the training — there are no "inputs" vs "outputs")

**Total Phase 2 cost: ~$15**

### Phase 3: Evaluate Rigorously
**Goal:** Know when the model is actually good, not just "sometimes ok."

**The Shower Test (from v1 plan):**
- Prompt: "The man decided to take a shower."
- Does it produce something that makes you stop and re-read?
- Compare: our model vs base model vs ChatGPT vs Claude

**Batch evaluation:**
- Generate 50 completions from 10 different prompts
- Rate each: (1) generic internet text, (2) somewhat literary, (3) genuinely surprising/alive
- Target: >50% in category 3

**Style markers to measure:**
- Lexical diversity (type-token ratio)
- Sensory word density
- Metaphor frequency
- Sentence length variance
- Absence of: bullet points, headers, "In this article", "Let's dive in", etc.

**A/B test with humans:**
- Show pairs (our model vs ChatGPT) to a few people
- "Which one was written by a human?" — we win if ours gets picked more often

### Phase 4: Deploy & Use
**Goal:** Model is usable for real tasks.

**Inference options (choose based on Phase 2 winner):**
- **If 7-8B wins:** Run locally on Mac Mini (Q4 quantized, ~25 tok/s) for free
- **If 12B+ wins:** Together.ai serverless or dedicated endpoint
- **Hybrid:** Local for daily tasks (Amber tweets), cloud for UI (/writer page)

**First application: Amber's daily tweet**
- Cron job generates a tweet using the model
- Human review step (Bart approves via Discord/SMS before posting)
- No auto-posting until model quality is proven

**Second application: /writer page on hilma**
- Streaming text completion UI (already built)
- Point at whichever inference endpoint wins

**Future applications (month 2+):**
- Music: model generates Jambot session configs → rendered to audio
- Expand corpus with music-related creative writing
- Amber's full creative pipeline powered by the model

---

## Key Principles (updated)
- **No RLHF, no instruction tuning** — the whole point is to avoid what killed GPT-2's creativity
- **CPT not SFT** — we are shifting probability distributions, not teaching task-following
- **Curate ruthlessly** — the model will only be as good as the writing we feed it
- **Don't constrain prematurely** — try multiple model sizes, pick the best, figure out serving later
- **Treat this like a real project** — research, experiment, evaluate, iterate
- **$100/mo budget** — plenty for experimentation on Together.ai

## Budget
| Item | Monthly Cost |
|------|-------------|
| Fine-tuning experiments (4-6 runs) | $15-30 |
| Inference (if cloud-served) | $5-20 |
| Corpus expansion tools | $0 (Project Gutenberg is free) |
| **Total** | **$20-50/mo** |

## Timeline
- **Week 1:** Corpus expansion (500+ passages) + first training experiments
- **Week 2:** Evaluate, iterate on training, find winning model
- **Week 3:** Deploy winner, wire up Amber tweets with human review
- **Week 4:** /writer page live, start music expansion
