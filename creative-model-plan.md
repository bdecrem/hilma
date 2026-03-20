# Plan: Build a Raw, Unfiltered Creative Writing Model

## Context
Inspired by the Atlantic article "The Human Skill That Eludes AI" — modern LLMs lost the creative weirdness of GPT-2/3 because RLHF and safety training made them rigid. Goal: build a model whose superpower is raw, unfiltered creativity. Start simple, iterate.

## Architecture Decision
**All-cloud on Together.ai. No local training or inference.**
- Small models (8B) are *more* creative/unpredictable — closer to GPT-2 spirit
- Together.ai fine-tuning is ~$5 for an 8B model, inference is fractions of a cent
- Mac Mini (M4, 16GB) is too tight for fine-tuning and unnecessary for inference
- Skip local complexity — curate the data, fine-tune in the cloud, serve from the cloud

---

## Phase 1: Curate the Training Corpus (Days 1-2)
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

## Phase 2: Fine-Tune on Together.ai (Days 3-4)
**Goal:** Fine-tune a base model on the curated corpus.

1. Pick a base (not instruct) model on Together.ai — candidates:
   - `meta-llama/Llama-3.1-8B` base
   - `mistralai/Mistral-7B-v0.1` base
2. Upload `corpus.jsonl` to Together.ai
3. Fine-tune via their API:
   - No instruction tuning, no chat format — pure text completion
   - 2-3 epochs, low learning rate
   - LoRA fine-tuning to keep costs low (~$5)
   - Key: we are NOT teaching it to follow instructions. We are shifting its probability distribution toward great writing.
4. Test the fine-tuned model:
   - Send completion prompts with high temperature (0.9–1.2), top-p 0.95, top-k 80
   - Test with prompts like "The man decided to take a shower." and compare to ChatGPT output
5. **Deliverable:** A Together.ai-hosted model that completes text in a noticeably more literary/creative way

## Phase 3: Build a Simple UI in Hilma (Days 5-6)
**Goal:** Make it usable and shareable.

1. Create a page in hilma (`src/app/writer/page.tsx`) with:
   - Text input for writing prompts
   - Sliders for temperature, top-p, top-k ("weirdness dial")
   - Output display with streaming
   - "Regenerate" button to get different completions
2. Backend API route (`src/app/api/writer/route.ts`) that hits Together.ai API
3. **Deliverable:** A working creative writing tool at `/writer` on hilma-nine.vercel.app

---

## Key Principles
- **No RLHF, no instruction tuning** — the whole point is to avoid what killed GPT-2's creativity
- **Curate ruthlessly** — the model will only be as good as the writing we feed it
- **Temperature is a feature** — high temp + base model = the "lemon in the shower" moments
- **Start small, iterate fast** — don't over-engineer before proving the concept

## Verification
- Compare outputs: fine-tuned model vs ChatGPT, same prompts
- "The shower test": does it produce surprising, unexpected continuations?
- Share samples with humans — does the writing feel alive?
