---
title: Public Benefit AI — a map of the field
topics: [public-benefit-ai, open-source-ai, philanthropy, landscape]
sources: web research compiled 2026-10-02 (links at the end); wiki/aibuilders/*; opensourceai/1pager.pages
---

# Public Benefit AI: a map of the field

Prepared 2026-10-02 for the conversation with Songyee Yoon and Mitchell Baker. Companion to the Open Source AI one-pager, which picks one lane (decentralized AI). This document draws the whole field so we can ask which lanes are empty.

It is a map, not a census: representative names, not every name. Facts are as of this week. Anything not confirmed from a primary source is marked *(unverified)*.

## 1. Scope: what counts as "public benefit AI"

**Proposed definition.** Work whose primary purpose is to make AI serve the public rather than a private return, where that purpose is protected by the organization's structure, and where AI is the center of the work.

**Three tests.** Something is on the map only if it passes all three.

1. **Purpose.** Public benefit is the mission, not a by-product. Meta's Llama is the most useful open-weight model family in the world and is not public benefit AI. Ai2's OLMo is.
2. **Structure.** The mission is locked in by form: nonprofit, university institute, public agency, standards consortium, or a mission-locked company. That last category (Anthropic's PBC plus its Long-Term Benefit Trust, the OpenAI Foundation, Mozilla Corporation) goes on the map as a hybrid, drawn with a dotted line.
3. **Centrality.** AI is a named program with its own people and budget, not a theme. This keeps off the map every foundation and think tank that merely "has an AI angle."

**Deliberately out of scope:**

- Commercial labs and their open-weight releases. They sit at the edge of the map as gravity wells, because they set what is possible for everyone else.
- Corporate responsible-AI teams and AI-ethics consultancies.
- Startups with impact marketing, and single-vertical AI products run by one company.
- General digital-rights and tech-policy organizations with no dedicated AI program.

**Geography.** Global in principle, US- and Europe-heavy in practice because that is where the money is. National "sovereign AI" programs (Switzerland, Canada, Japan, Korea, India, Singapore) are included where they are framed and funded as public goods.

## 2. The boxes

The map is organized by what an organization *produces*, because gaps show up by output, not by stated values. Eight boxes in three tiers, plus one cross-cutting box.

| Tier | Box | What it produces |
|---|---|---|
| Build | 1. Open models and code | Models, training recipes, open tooling |
| Build | 2. Commons infrastructure | Data, compute, evaluation, standards, serving |
| Build | 3. Public-interest products | AI the public actually uses: clients, assistants, agents |
| Steer | 4. Alignment and safety | Safety research, evaluations, government institutes |
| Steer | 5. AI and society | Policy, rights, democracy, labor and economy, advocacy |
| Apply | 6. AI for science and health | Discovery, biology, global health |
| Apply | 7. AI for education, government, journalism, civic life | Public services and the information commons |
| Cross-cutting | 8. Funders, field-builders, talent | Money, coalitions, fellowships, accelerators |

Bart's starting list maps onto this as: coding projects → box 1 (and 3); alignment research and labs → box 4; AI & society → box 5.

## 3. The map at a glance

| Box | Representative organizations (form) | Mozilla | Stanford HAI | Crowding |
|---|---|---|---|---|
| 1. Open models and code | Ai2 (NP), Swiss AI / Apertus (ACAD), EleutherAI (NP), LAION (NP), OpenEuroLLM (EU consortium), Pleias (CO), Japan GENIAC / LLM-jp, Korea Sovereign AI, IndiaAI, PyTorch Foundation, Agentic AI Foundation (LF). Edge: Llama, DeepSeek, Qwen, gpt-oss, Gemma, Mistral, Hugging Face | Mozilla.ai tooling (any-llm, llamafile, Otari), Mila–Mozilla foundation layer (Sep 2026) | Marin open lab (CRFM) | Crowded on the surface, fragile underneath |
| 2. Commons infrastructure | Common Crawl, Common Pile, Common Corpus, Mozilla Data Collective, Wikimedia, Internet Archive, Open Future; NAIRR, EuroHPC AI Factories, Isambard-AI, Alps; AI Index, HELM, FMTI, Epoch AI, MLCommons, METR; Public AI Inference Utility, Current AI, AI Alliance | Data Collective, Common Voice, Public AI Network backer | AI Index, HELM, FMTI, Marlowe cluster | Thin, and thinning where it matters |
| 3. Public-interest products | Firefox Smart Window, Public AI utility chat, Current AI's AlphaChat, Khanmigo, Oak's Aila, Jacaranda PROMPTS, Code for America's SNAP navigator | Firefox (nascent), Mozilla.ai Octonous | None | Near-empty |
| 4. Alignment and safety | METR, Redwood, ARC, FAR.AI, Resolution, Transluce, CAIS, Apollo, MATS; US CAISI, UK AISI, EU AI Office, Canada/Japan/Korea/Singapore AISIs; funders: Coefficient Giving, FLI, SFF, Longview, Schmidt, ARIA | None | Stanford Center for AI Safety sits in Engineering, not HAI | Crowded in money, bottlenecked on people |
| 5. AI and society | AI Now, DAIR, Data & Society, Ada Lovelace, CDT, EPIC, AJL, PAI, Berkman Klein, CSET, GovAI, IFP, RAND, Carnegie, Brookings, Encode, ARI; labor: Stanford Digital Economy Lab, MIT Shaping the Future of Work, OpenResearch, Economic Security Project, Windfall Trust | Fellowships, Democracy x AI incubator, Humanity AI member; advocacy division cut Nov 2024 | Policy pillar, Congressional boot camp, RegLab, Digital Economy Lab | Crowded on governance, thin on economy and labor |
| 6. Science and health | Arc Institute, FutureHouse, Open Athena, CZ Biohub, Schmidt AI2050 and AI in Science, Astera Radial, DOE Genesis Mission, NSF OMAI; Gates, PATH, Jacaranda, Wadhwani, OpenAI Foundation. Edge: Isomorphic, Lila, Periodic, Edison | None (Ersilia via Builders) | Discovery pillar, MedHELM, aging-in-place center | Crowded in money, thin on rigor in LMICs |
| 7. Education, government, journalism, civic | Khan Academy, Common Sense Media, ISTE+ASCD, AFT AI academy, LEVI, Digital Promise, Oak; Code for America, UK i.AI, Stanford RegLab; Lenfest, Hacks/Hackers, Wikimedia, Internet Archive, Knight | None | Education pillar, federal-employee AI training | Moderate, agenda set by industry money |
| 8. Funders, field-builders, talent | Humanity AI, Current AI, Public AI Network; Coefficient, Gates, OpenAI Foundation, McGovern, Schmidt Sciences, Omidyar, Siegel, Hewlett, Rockefeller, Knight; Mozilla Builders, Mozilla Ventures, Fast Forward, AI2050 fellows, MATS, Anthropic/OpenAI fellows | Ventures, fellowships, Humanity AI member; Builders dormant | Hoffman-Yee and seed grants ($60M cumulative) | Crowded in pledges, thin in operators |

NP = nonprofit, ACAD = academic, CO = company, LF = Linux Foundation, LMIC = low- and middle-income countries.

## 4. Notes by box

### Box 1. Open models and code

- **Ai2** is still shipping (Olmo 3.1 in Dec 2025, Olmo-core 3 released today) but lost its CEO Ali Farhadi in Mar 2026 and then him plus 10+ researchers, including OLMo co-lead Hannaneh Hajishirzi, to Microsoft's superintelligence team. Post-training lead Nathan Lambert left in Jun 2026. It holds a $152M NSF+NVIDIA program (OMAI). Budget roughly $50–80M/yr *(unverified)*.
- **Apertus** (ETH Zurich, EPFL, CSCS) is the one public builder that scaled in 2026: CHF 20M plus 20M GPU-hours a year on Alps through 2028, Apertus 1.5 GA in Sep 2026, 4M downloads, the most-downloaded European model on Hugging Face this summer.
- **OpenEuroLLM** (€101M, 20 partners) is late and names compute as its binding constraint: 2B reference models and experimental 9B checkpoints, no flagship.
- **National programs** framed as public goods: Japan GENIAC (Rakuten AI 3.0, a ~700B MoE under Apache 2.0; LLM-jp fully open), Korea's Sovereign AI Foundation Model project (Upstage, SK Telecom, LG AI Research in phase 3; 29 public training datasets, ~1.56T tokens, opened Aug 2026), IndiaAI Mission (38k GPUs, 12 model teams), Canada's "AI for All" (~C$2B, Jun 2026, public supercomputer by 2031), Singapore's SEA-LION.
- **Open tooling** has institutional homes now: PyTorch Foundation (vLLM, DeepSpeed, Ray) and the Agentic AI Foundation under the Linux Foundation (MCP, goose, AGENTS.md, A2A since Aug 2026; 250+ members).
- **Mozilla's new bet**: the Mila–Mozilla open-source "foundation layer" announced 17 Sep 2026 in Montreal ($5M initial from Mozilla, Hypertec $1M, Government of Canada support). llamafile lives on at Mozilla.ai (v0.10.6, Sep 2026). Lumigator was archived and any-agent soft-deprecated in 2026.
- **Gravity wells**: Nvidia agreed to buy Hugging Face for $12.9B on 3 Sep 2026. The ecosystem's hub is becoming a chip vendor's.
- **Verdict.** Plenty of open weights from companies and states. The fully open, nonprofit bench is fragile: Ai2 wobbling, Apertus alone at scale, fully open post-training recipes "further behind than ever" (Lambert).

### Box 2. Commons infrastructure

- **Data.** Common Crawl is steady (2.17B pages in the Sep 2026 crawl). Common Pile (EleutherAI, 8TB openly licensed) and Common Corpus (Pleias, ~2.27T tokens) are the licensed corpora. **Mozilla Data Collective** spun out of the Foundation in Apr 2026 as a UK company under the nonprofit, raised $5M in Sep 2026, and hosts 1,700+ datasets in 450+ languages including Common Voice. Wikimedia adopted its first AI strategy in Jan 2026 and signed paid Enterprise deals with Amazon, Meta, Microsoft, Mistral and Perplexity. The Internet Archive is rate-limiting the Wayback Machine against bot traffic. Open Future (EU) is the think tank arguing for levies and mandated data access to fund the commons.
- **Compute.** Government-led everywhere. US NAIRR is still a pilot (a $35M operations center was awarded in Sep 2026; the CREATE AI Act passed House Science 29–0 but has no floor vote). EuroHPC has 19 AI Factories and opened the AI Gigafactories call in Jul 2026. UK Isambard-AI (£225M) is oversubscribed and now backs a £500M Sovereign AI Unit. Philanthropic compute is one-off: the Huang Foundation's $108M of CoreWeave credits (May 2026), a CZI GPU call, Open Athena lending engineers and compute to academic labs.
- **Evaluation is going commercial.** LMArena raised at a $1.7B valuation (Jan 2026); Artificial Analysis and Scale SEAL are venture or corporate. The nonprofit and academic bench is the AI Index (HAI), Epoch AI, MLCommons, METR. **HELM went into maintenance mode on 1 Jun 2026.** The Foundation Model Transparency Index (Dec 2025) shows average transparency falling from 58 to 40. The international network of AI safety institutes dropped "safety" from its name in Dec 2025.
- **Serving.** The Public AI Inference Utility (nonprofit, Sep 2025) serves Apertus and SEA-LION on donated national compute, with library pilots in Utah, Georgia and New Jersey; scale undisclosed. Current AI (Paris, CEO Ayah Bdeir) has $400M committed against a $2.5B target and had deployed one $3.2M pilot cohort by Oct 2026; its Gap Map v0.1 (Jul 2026) names inference "bus factor" (vLLM, llama.cpp, SGLang), synthetic-data tooling, eval datasets and agent authorization as holes.
- **Verdict.** This is the layer every other box depends on and almost nobody funds as such. Independent measurement is shrinking, licensed multilingual data is tiny relative to need, and compute outside government is anecdotal.

### Box 3. Public-interest products

- The box is nearly empty. No public-benefit organization ships a mainstream AI product to the general public.
- Nearest attempts: Firefox Smart Window (beta Aug 2026, US/Canada English, Mistral models) and the Firefox AI kill switch (148, Feb 2026); the Public AI utility's chat; Current AI's "AlphaChat" open chatbot (Jul 2026); Khanmigo ($4/month, free for teachers in 44 countries); Oak National Academy's Aila; Jacaranda's PROMPTS in 24 Kenyan counties; Code for America's SNAP Policy Navigator built with Anthropic.
- Mozilla.ai pivoted in 2025 from research lab to revenue (CEO John Dickerson); its products Octonous and Otari are commercial. No Series A found through Sep 2026.
- Mozilla's 2026 plan is ~$650M of spend, 80% on Firefox and Thunderbird, 20% on open-source and trustworthy AI, with $1.4B in reserves.
- **Verdict.** Near-empty. This is the "serving and interop, the real Mozilla move" line in the one-pager. The organization best placed to fill it is spending four-fifths of its budget elsewhere.

### Box 4. Alignment and safety

- **Independent labs** are well funded and multiplying: METR (~$71M raised in six months to Aug 2026, no AI-company money), FAR.AI ($30M+ in Jan 2026), Redwood (AI control), ARC (Paul Christiano back as ED Aug 2026), Transluce ($11M target), CAIS, EleutherAI. **Resolution** is the big 2026 formation: Timaeus merged with the UK AISI alignment team (Irving, Murfet, Hoogland), targeting 40–80 staff and $100–150M. Apollo reportedly converted to a PBC *(unverified)*; Conjecture closed in Mar 2026; Goodfire is a company at $1.25B.
- **Government.** UK AISI (£66M/yr, 100+ technical staff) is the stable one. US CAISI (~$55M) lost its director after three months in Jul 2026 and NIST's page now carries a second rename *(rationale unverified)*. The EU AI Office enforces GPAI rules from Aug 2026 but the Digital Omnibus delayed high-risk obligations to 2027–28. Canada, Japan, Korea (ETRI) and Singapore run smaller institutes.
- **Money.** Coefficient Giving (Open Philanthropy's new name since Nov 2025) put ~$350–410M into AI safety and biosecurity in 2025 and plans ~$1B in 2026. Manifund projects $1.5–1.8B into AI-safety philanthropy in 2026 (Coefficient, OpenAI Foundation ~$250M, Longview ~$200M, Macroscopic ~$100M, SFF ~$63M, Schmidt ~$20M) and counts $3.5B cumulative across 4,800+ grants.
- **Talent.** MATS runs three cohorts a year (120 fellows each); Anthropic and OpenAI both run safety fellowships.
- **Verdict.** The best-funded box by far. Coefficient's stated bottleneck is grantmaker and senior-researcher capacity, not money. The US government arm is wobbling.

### Box 5. AI and society

- **Research and policy** is dense: AI Now, DAIR, Data & Society (AI Civics, $3M; "Worker Lens" Sep 2026), Ada Lovelace, CDT's AI Governance Lab, EPIC, Algorithmic Justice League, Partnership on AI (141 partners), Berkman Klein, CSET (>$100M from Open Phil/Coefficient), GovAI, Institute for Progress, RAND CAST, Carnegie, Brookings. Stanford's Cyber Policy Center became the Tech Impact & Policy Center in Sep 2025.
- **Advocacy** has sharpened into legislation: Encode (sponsored California SB 53 and New York's RAISE Act), Americans for Responsible Innovation (the anti-preemption fight), ControlAI, the AI Policy Institute.
- **Labor and economy** is where the evidence is thin. Stanford Digital Economy Lab's "Canaries" paper (updated Aug 2026) finds employment of 22–25-year-olds in AI-exposed jobs ~19% below counterfactual, via reduced hiring rather than layoffs. The lab launched AI Economic Indicators in Jun 2026. MIT's Shaping the Future of Work, OpenResearch's UBI follow-ups, the Economic Security Project (an "Office of AI Supervision" proposal, Sep 2026), the new Windfall Trust, and Rockefeller's $100M "Good Jobs for America" (Apr 2026) are the rest. Both ARI and Stanford DEL say there is no adequate federal data on AI's workforce effects.
- **Mozilla Foundation** cut 30% of staff and eliminated its advocacy and global-programs divisions in Nov 2024. What remains: a 2026 fellowship (10 × $100K), a Democracy x AI incubator (10 × $50K), and membership in Humanity AI.
- **Verdict.** Crowded on governance and principles, concentrated in DC, NYC and London. Thin on economic distribution, on labor transition, and on the question nobody owns: what people do all day when intelligence is abundant.

### Box 6. AI for science and health

- **Science** is the second-best-funded box. Arc Institute ($650M initial; Evo 2 in Nature, Mar 2026), FutureHouse (nonprofit; spun out for-profit Edison Scientific in Nov 2025), Open Athena (Siegel and Hammerbacher; engineers plus compute for academic foundation models), CZ Biohub (acquired EvolutionaryScale; $500M Virtual Biology Initiative *(secondary sources)*), Schmidt Sciences (AI2050's 2026 class: 28 fellows, $18M; AI in Science postdocs $148M), Astera's Radial (up to $500M over a decade). The DOE Genesis Mission reached >$5B across 278 projects in Jul 2026. Commercial edge: Isomorphic ($2.1B), Lila, Periodic.
- **Health and development.** Gates committed $1B over two years to "equitable AI" in Sep 2026 (40% health, 40% education) plus $200M with Anthropic and a $50M "Horizon 1000" clinic program with OpenAI. EVAH ($60M with Novo Nordisk Foundation and Wellcome) exists because rigorous trials of AI clinical tools in LMICs barely exist. Jacaranda, Wadhwani AI and PATH are the operators.
- **Verdict.** Money is abundant from government, mega-philanthropy and companies. The thin parts are evaluation and durability: "pilots end the moment the donor leaves."

### Box 7. Education, government, journalism, civic life

- **Education** has operators but industry sets the agenda: the AFT National Academy for AI Instruction is funded by Microsoft, OpenAI and Anthropic ($23M); ISTE+ASCD's 6M-educator program is with Google; Khanmigo partners with Microsoft and Google. Independent: Common Sense Media's AI risk assessments, LEVI (350K students, $40M Walton anchor), Digital Promise ($26M K-12 AI infrastructure), Oak National Academy. Less than 2% of US federal education spending is R&D.
- **Government.** Capacity is shrinking in the US: USDS went from ~230 to ~65 staff and DOGE was terminated in Jul 2026; the US Tech Force (Dec 2025) has not published placements. Code for America published a 50-state AI landscape (May 2026). Stanford RegLab ran AI across 500M words of state statutes with NY, CA and MD. HAI trains federal employees with GSA and OMB.
- **Journalism and information.** Lenfest's AI Collaborative (OpenAI doubled support in Sep 2026), Hacks/Hackers, Knight's $3M local-news AI. Wikipedia's human pageviews fell ~8% year over year; both Wikimedia and the Internet Archive say AI firms strain their infrastructure without paying for it.
- **Verdict.** Moderate. The operators exist; the money is mostly from labs.

### Box 8. Funders, field-builders, talent

- **Coalitions.** Humanity AI ($500M over five years; MacArthur and Omidyar co-chairs; Doris Duke, Ford, Kapor, Lumina, Mellon, Mozilla, Packard, Siegel) made its first grants in May 2026: >$18M to 12 coastal grantees at ~$500K each, plus a $10M open call; it was still hiring an executive director seven months after launch. Current AI: $400M committed, ~$3.2M deployed. Public AI Network: 350+ members.
- **Philanthropies.** Gates ($1B/2y), Coefficient (~$1B in 2026), OpenAI Foundation ($25B pledged; ~$200M disbursed; $50M People-First AI Fund to 208 nonprofits), McGovern ($75.8M in 2025; $500M/decade), Schmidt Sciences, Hewlett ($100M Emerging Technology & Security, Jul 2026), Rockefeller ($100M jobs), Omidyar (~$30M generative-AI portfolio), Siegel, Knight, FLI, SFF, Longview, Macroscopic, Lightcone Commons.
- **Field-builders and talent.** Mozilla Builders ran one accelerator cohort (Sep–Dec 2024, 14 projects, up to $100K each) and appears dormant since. Mozilla Ventures ($35M, 55+ investments, exploring a raise). Fast Forward's 2026 cohort is 7/10 AI. AI2050 fellows, HAI's Hoffman-Yee and seed grants, MATS, Anthropic and OpenAI fellows. Bart's own research files: HIT Initiative, Project Positive Sum, Nevo Labs, Open Athena.
- **Verdict.** Crowded in pledges, thin in operators. Coefficient says it has more fundable work than it can evaluate; Inside Philanthropy says Humanity AI funded "the usual suspects"; Current AI has deployed under 1% of commitments in 20 months.

## 5. Where the three of us already sit

| | Boxes | Notes |
|---|---|---|
| **Mitchell Baker** | Historically 1, 3, 5, 8 via Mozilla | Left all Mozilla boards on 19 Feb 2025 (Nicole Wong now chairs the Foundation; Mark Surman chairs the Leadership Council). Identifies as Mozilla co-founder; last public writing Apr 2025 on open-source AI in Africa. No new formal affiliation found. She cannot commit Mozilla; the one-pager's "the real Mozilla move" should read "a Mozilla-style move." |
| **Songyee Yoon** | 5, 8, and Asia on box 1 | Inaugural member of the Stanford HAI Advisory Council since 2019 (not staff or faculty); whether she is on the post-merger council list is *(unverified)*, the page is script-rendered. Also MIT Corporation, HP board (Feb 2025), Carnegie Endowment trustee, founder of Principal Venture Partners (2024). Former NCSOFT president and CSO. Her Korea link matters: Korea's sovereign model program and its Aug 2026 release of 1.56T tokens of public training data. |
| **Stanford HAI** | 2, 5, 6, 7, 8 | Merged with Stanford Data Science on 4 May 2026 under the HAI name, three pillars (discovery, education, societal impact), 400+ scholars, $60M cumulative grants, Marlowe cluster. James Landay is sole director; Fei-Fei Li and John Hennessy co-chair the Advisory Council. HELM in maintenance mode since Jun 2026. |
| **Bart** | 8, with 1 and 3 by practice | Co-founded Mozilla Builders; the HIT, Positive Sum and AI-impact-incubator research in this repo; a year of shipping with AI. The "now what" project is the only thing in this folder aimed at the meaning question. |

## 6. Money map

Orders of magnitude, 2026, to show where dollars pool. Not a budget.

| Box | Scale | Who pays |
|---|---|---|
| 4. Safety | ~$1.5–1.8B philanthropy projected for 2026; ~$55M US CAISI; £66M UK AISI | Coefficient, OpenAI Foundation, Longview, Macroscopic, SFF |
| 6. Science and health | Multiple $B: Genesis >$5B, Gates $1B/2y, Arc $650M, Astera $500M/decade | Government, mega-philanthropy, companies |
| 2. Compute | Government: EU gigafactories, UK £725M, Swiss CHF 20M/yr; US NAIRR unlegislated; philanthropy ~$100M one-off | Governments |
| 5. Society | Humanity AI $100M/yr pledged ($18M out); McGovern ~$75M/yr; Hewlett $20M/yr; Rockefeller $33M/yr | Legacy foundations |
| 1. Open models | Apertus CHF 20M/yr; Ai2 ~$50–80M/yr *(unverified)*; OpenEuroLLM €101M total; Mozilla ~$130M/yr across all AI | Universities, states, Mozilla |
| 7. Education and civic | AFT $23M, LEVI $40M, Digital Promise $26M, Lenfest ~$10M; Gates education share ~$400M | Mostly AI labs |
| 8. Field and talent | Large pledges, small deployment | Everyone, slowly |
| 3. Products | No dedicated funding found | Nobody |

## 7. Under-served: a ranked view

1. **The public-interest product layer (box 3).** Nobody ships. The need: an open client that routes across models, with a public-interest default. Nearest live pieces are Firefox Smart Window, the Public AI utility, Current AI's AlphaChat. Mozilla is the natural owner and is spending 80% on the browser.
2. **Independent measurement (box 2).** HELM in maintenance, LMArena commercial, transparency falling, "safety" dropped from the international network's name. Cheap relative to models, and HAI already owns the AI Index.
3. **Licensed, multilingual data commons and reciprocity (box 2).** Wikimedia and the Internet Archive are strained; Mozilla Data Collective is the live vehicle; Current AI's language pilot is $3.2M. Korea's public data release is a model other states could copy.
4. **Public compute outside government (box 2).** NAIRR unlegislated, OpenEuroLLM compute-starved, philanthropy one-off. Open Athena's "lend engineers and GPUs to academics" is the only institutional pattern.
5. **Labor transition, distribution, and meaning (box 5 and nowhere).** No federal workforce data; effects show up in entry-level hiring; Rockefeller's $100M is the largest dedicated program. No institution owns "what will people do all day." This is the "now what" project's question.
6. **Fully open model recipes (box 1).** Ai2's core left for Microsoft; Apertus is the only scale-up; Europe is late. The recipe matters more than any one model.
7. **Operators and grantmakers (box 8).** Coefficient cannot evaluate what it could fund; Humanity AI took seven months to hire a director; Current AI has deployed <1%. The scarce input is people who can run programs, not dollars.

## 8. Crowded: where not to go without a twist

- Technical safety research funding (box 4).
- Governance and policy shops in DC, NYC and London (box 5).
- AI-for-biology mega-institutes (box 6).
- Teacher AI training funded by labs (box 7).

## 9. Questions to open the conversation

1. Does the boundary hold? Three tests: purpose, structure, centrality. Where do mission-locked companies belong?
2. Which boxes do the three of us have unfair advantages in? Mozilla's inheritance is product and community; HAI's is measurement and convening; Bart's is builder programs and shipping.
3. Is "operators, not dollars" the real gap? If yes, the move is a builders program or field vehicle, not another fund.
4. Is the client layer a Mozilla move that Mozilla will not make? If so, can it be made outside Mozilla with Mozilla's blessing?
5. What does Korea and the wider Asian sovereign-AI effort look like from Songyee's seat, and is it on anyone's map in the West?
6. Who owns the "now what" question: time, distribution, meaning? Nobody on this map is a box for it.

## Sources and caveats

Compiled 2 Oct 2026 from web research across three passes; the open-model and Mozilla passes hit search limits near the end, so a few items rest on direct page fetches. mozillafoundation.org, the HAI people page and a handful of news sites blocked fetches. Items marked *(unverified)* could not be confirmed from a primary source. Not found despite trying: Mozilla's official headcount, Mozilla Ventures' current managing partner, budgets for CAIS, Apollo, Redwood and ARC, HAI's annual budget, whether Humanity AI's $10M open call opened.

Load-bearing links:

- Mitchell Baker leaves Mozilla boards (Feb 2025): https://blog.mozilla.org/en/mozilla/mozilla-leadership-growth-planning-updates/
- Mozilla 2026 strategy and 80/20 spend: https://www.cnbc.com/2026/01/27/mozilla-building-an-ai-rebel-alliance-to-take-on-openai-anthropic-.html
- Mila–Mozilla foundation layer: https://blog.mozilla.org/en/mozilla/mila-canada-open-source-ai-initiative/
- Mozilla Data Collective $5M: https://www.hpcwire.com/aiwire/2026/09/18/mozilla-data-collective-raises-5m-to-scale-a-more-equitable-data-ecosystem-for-ai/
- Mozilla.ai pivot: https://siliconangle.com/2025/08/22/mozilla-ai-charts-new-course-turn-toward-profitability/
- HAI merger with Stanford Data Science: https://hai.stanford.edu/news/stanford-merges-ai-and-data-science-efforts-under-single-institute
- Songyee Yoon profile: https://www.songyeeyoon.org/ and https://news.mit.edu/2023/school-engineering-welcomes-songyee-yoon-visiting-innovation-scholar-0920
- HELM maintenance mode: https://github.com/stanford-crfm/helm
- Foundation Model Transparency Index Dec 2025: https://crfm.stanford.edu/fmti/December-2025
- Ai2 departures: https://www.geekwire.com/2026/microsoft-hires-former-ai2-ceo-ali-farhadi-and-key-researchers-for-suleymans-ai-team/ and https://www.interconnects.ai/p/farewell-ai2
- Apertus 1.5 GA: https://www.apertus-ai.org/articles/2026-09-apertus-1-5-ga/
- OpenEuroLLM progress: https://openeurollm.eu/blog/first-year-progress-and-next-steps
- Nvidia to acquire Hugging Face: https://blogs.nvidia.com/blog/nvidia-to-acquire-hugging-face/
- Current AI and its Gap Map: https://techcrunch.com/2026/07/19/nonprofit-current-ai-is-racing-to-build-the-world-wide-web-of-ai-free-for-all/ and https://www.currentai.org/blogs/introducing-the-gap-map-v0-1
- Public AI Inference Utility: https://publicai.co/stories/utility
- Agentic AI Foundation: https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation
- NAIRR operations center and CREATE AI Act: https://www.sdsc.edu/news/2026/PR20260901-NAIRR-OC.html and https://science.house.gov/2026/6/h-r-2385-create-ai-act
- EuroHPC gigafactories call: https://www.eurohpc-ju.europa.eu/eurohpc-joint-undertaking-launches-ai-gigafactories-call-2026-07-30_en
- Isambard-AI and the Sovereign AI Unit: https://www.bristol.ac.uk/research/centres/bristol-supercomputing/articles/2026/isambard-ai-supercomputer-powers-500m-uk-sovereign-ai-fund.html
- LMArena valuation: https://techcrunch.com/2026/01/06/lmarena-lands-1-7b-valuation-four-months-after-launching-its-product/
- Coefficient Giving rename: https://coefficientgiving.org/research/the-story-behind-our-new-name/
- AI-safety funding totals (Manifund bulletin): https://manifund.org/ais-funder-bulletin
- METR: https://metr.org/about ; FAR.AI $30M: https://www.far.ai/blog/30m-multi-funder-support ; Resolution launch: https://resolution.org/launch
- US CAISI: https://www.nist.gov/caisi ; UK AISI: https://www.aisi.gov.uk/about
- Humanity AI first grants: https://www.fordfoundation.org/news-and-stories/news-and-press/news/humanity-ai-announces-more-than-18-million-in-new-grants-to-shape-ai-for-the-public-good/
- Gates $1B equitable AI: https://www.gatesfoundation.org/ideas/media-center/press-releases/2026/09/goalkeepers-report-equitable-ai
- OpenAI Foundation update: https://openai.com/index/update-on-the-openai-foundation/
- Hewlett $100M initiative: https://hewlett.org/newsroom/hewlett-foundation-announces-new-100-million-emerging-technology-and-security-initiative/
- Stanford Digital Economy Lab "Canaries": https://digitaleconomy.stanford.edu/publications/canaries-in-the-coal-mine/
- DOE Genesis Mission: https://www.whitehouse.gov/releases/2026/07/45502/
- Schmidt Sciences AI2050 2026 class: https://www.schmidtsciences.org/ai2050-fellows-2026-announcement/
- Korea public training data release: https://blog.pebblous.ai/report/dokpamo-training-data-aihub-open-2026-08/en/
- Wikimedia Enterprise AI deals: https://techcrunch.com/2026/01/15/wikimedia-foundation-announces-new-ai-partnerships-with-amazon-meta-microsoft-perplexity-and-others/
- Code for America and Anthropic: https://codeforamerica.org/news/anthropic-partnership/
