# Plan: Build a Raw, Unfiltered Creative Writing Model

## Context
Inspired by the Atlantic article "The Human Skill That Eludes AI" — modern LLMs lost the creative weirdness of GPT-2/3 because RLHF and safety training made them rigid. Goal: build a model whose superpower is raw, unfiltered creativity. Start simple, iterate.

## Architecture Decision
**Start local (8B base model), graduate to Together.ai for deployment.**
- Small models are *more* creative/unpredictable — closer to GPT-2 spirit
- Full control locally — no content policy, no guardrails, truly unfiltered
- Zero cost to iterate. Move to Together.ai when ready to deploy as API.

---

## Phase 1: Local Base Model Setup (Day 1)
**Goal:** Get a base model running locally and prove the "raw creativity" concept works.

1. Install Ollama (if not already installed)
2. Pull a **base** (not instruct) model — candidates:
   - `mistral:7b` base variant
   - `llama3.1:8b` base variant
   - Possibly grab a GGUF from HuggingFace (e.g., `Llama-3.1-8B` base)
3. Write a simple test script (`creative-test.js` or `.py`) that:
   - Sends completion prompts (not chat) to the local model
   - Uses high temperature (0.9–1.2), top-p 0.95, top-k 80
   - Tests with prompts like "The man decided to take a shower." and compares to ChatGPT output
4. **Deliverable:** Side-by-side comparison showing the local base model is weirder/more creative

## Phase 2: Curate the Training Corpus (Days 2-3)
**Goal:** Build a dataset of writing that embodies the creativity we want.

1. Curate ~500-2000 passages of great, weird, raw writing:
   - Literary fiction (Ted Chiang, Borges, Clarice Lispector, Denis Johnson)
   - Poetry (Anne Carson, Frank O'Hara, Neruda)
   - Experimental essays, New Journalism (Joan Didion, Hunter S. Thompson, David Foster Wallace)
   - Song lyrics with strong imagery
   - Avoid: corporate prose, SEO content, Reddit, self-help
2. Format as JSONL for fine-tuning:
   ```jsonl
   {"text": "The full passage here..."}
   ```
3. Store corpus in `training-data/` directory
4. **Deliverable:** `training-data/corpus.jsonl` — clean, curated, formatted

## Phase 3: Fine-Tune Locally (Days 3-5)
**Goal:** LoRA fine-tune the base model on only great writing.

1. Set up fine-tuning environment:
   - `unsloth` (fastest for Mac/consumer GPU) or `mlx-lm` (Apple Silicon native)
   - LoRA rank 16-32, targeting attention layers
2. Fine-tune on the curated corpus:
   - No instruction tuning, no chat format — pure text completion
   - 2-3 epochs, low learning rate
   - Key: we are NOT teaching it to follow instructions. We are shifting its probability distribution toward great writing.
3. Test the fine-tuned model with the same prompts from Phase 1
4. **Deliverable:** A local model that completes text in a noticeably more literary/creative way

## Phase 4: Build a Simple UI in Hilma (Days 5-6)
**Goal:** Make it usable and shareable.

1. Create a page in hilma (`src/app/writer/page.tsx`) with:
   - Text input for writing prompts
   - Sliders for temperature, top-p, top-k ("weirdness dial")
   - Output display with streaming
   - "Regenerate" button to get different completions
2. Backend API route that talks to the local model (or Together.ai)
3. **Deliverable:** A working creative writing tool at `/writer`

## Phase 5: Deploy to Together.ai (Day 7+)
**Goal:** Make the model accessible as an API, not tied to your laptop.

1. Upload the fine-tuned model (or the corpus) to Together.ai
2. Fine-tune on Together using their API (~$5 for an 8B model)
3. Switch the hilma `/writer` page to hit Together.ai API
4. **Deliverable:** Cloud-hosted creative model, accessible from hilma on Vercel

---

## Key Principles
- **No RLHF, no instruction tuning** — the whole point is to avoid what killed GPT-2's creativity
- **Curate ruthlessly** — the model will only be as good as the writing we feed it
- **Temperature is a feature** — high temp + base model = the "lemon in the shower" moments
- **Start small, iterate fast** — don't over-engineer before proving the concept

## Verification
- Compare outputs: base model vs fine-tuned model vs ChatGPT, same prompts
- "The shower test": does it produce surprising, unexpected continuations?
- Share samples with humans — does the writing feel alive?
