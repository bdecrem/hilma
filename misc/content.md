# Open Source AI

Can we offer an alternative to a world where one or two labs hold a monopoly on superintelligence, against the pull of concentrated capital and economies of scale? Three possible approaches.

## 1. Open Source AI

Publish everything: weights, training data, pipeline, checkpoints. The model can be rebuilt from scratch, not just run.

- **OLMo (Ai2)** — 32B, the complete worked example. The core team left for Microsoft in 2026; the recipe survived the institution.
- **Apertus (ETH Zurich, EPFL)** — 70B, 1,000+ languages, trained on a public supercomputer. Roughly 2024-level quality.
- **Pythia / BLOOM** — the earlier public-compute proofs. Foundational, not used in production.

**Traction:** small. These matter as recipes, not products.
**Pros:** a fully open stack, reproducible and auditable.
**Cons:** full openness can hand over capability; training runs are expensive; open weights soak up the demand.

## 2. Open Weight

Weights are downloadable, with an open-source ecosystem around them. Data and pipeline stay closed. You can run and tune, not rebuild.

- **Llama (Meta)** — the base a generation built on.
- **gpt-oss (OpenAI)** — 117B, Apache 2.0.
- **Gemma (Google)** — small and servable.
- **Mistral** — proof a tiny team can compete.
- **Qwen (Alibaba)** — the most fine-tuned base family.
- **DeepSeek** — frontier-adjacent, MIT, moved markets.

**Pros:** lots to pick from; easy onboarding; tune your own model; low cost.
**Cons:** crowded space; partial mission impact; you're a tenant. The lab owns the lineage and can stop releasing anytime.

## 3. Decentralized AI

The original 2015 OpenAI vision: an organization dedicated to decentralized AI. A portfolio of products and services around one spine.

- **Data commons** — the spine: a clean, licensed corpus nobody can sue over.
- **Open evaluation** — whoever owns the measuring stick steers the field.
- **Serving and interop** — the open client layer. The real Mozilla move.
- **Agentic consumer offering** — an open agent that routes across models.
- **Interpretability and safety** — public tools for seeing inside models.
- **Shared compute pool** — so small teams can train at all.
- **Fine-tuning recipes** and a **model garden** — what makes a base model useful.

**Comps:** the original OpenAI, and Hugging Face.
**Pros:** goes to the root problem, decentralization; sidesteps the safety issues of raw weights; no frontier-scale capital; real demand on top.
**Cons:** infrastructure, not a throne (billions, not hundreds of billions); mission teams can drift or leave; without a spine it's five half-funded projects.
