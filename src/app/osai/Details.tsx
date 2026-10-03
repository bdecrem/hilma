import Link from 'next/link'

// The full Public Benefit AI map, as of 2 Oct 2026. The long-form text with
// every link is apps/osai/content/map.md (from docsrepo); this is its page.

type Level = 'empty' | 'thin' | 'split' | 'moderate' | 'crowded'
const LV: Record<Level, string> = {
  empty: 'var(--lv-empty)',
  thin: 'var(--lv-thin)',
  split: 'var(--lv-split)',
  moderate: 'var(--lv-moderate)',
  crowded: 'var(--lv-crowded)',
}

function Marks({ m, h }: { m: boolean; h: boolean }) {
  return (
    <div className="marks">
      <span className={`mark m${m ? '' : ' off'}`}>M</span>
      <span className={`mark h${h ? '' : ' off'}`}>H</span>
    </div>
  )
}

function Unv({ children = 'unverified' }: { children?: React.ReactNode }) {
  return <span className="unv">{children}</span>
}

function Box({
  n,
  title,
  level,
  m,
  h,
  output,
  pills,
  orgs,
  edge,
  mozilla,
  hai,
  notes,
  verdict,
  span,
}: {
  n: number
  title: string
  level: Level
  m: boolean
  h: boolean
  output?: string
  pills: { text: string; level: Level }[]
  orgs: string[]
  edge?: string[]
  mozilla: React.ReactNode
  hai: React.ReactNode
  notes: React.ReactNode[]
  verdict: React.ReactNode
  span?: boolean
}) {
  return (
    <article id={`box-${n}`} className={`box${span ? ' span' : ''}`} style={{ ['--lv' as string]: LV[level] }}>
      <div className="box-head">
        <div>
          <span className="num">Box {n}</span>
          <h3>{title}</h3>
        </div>
        <Marks m={m} h={h} />
      </div>
      {output && <div className="output">{output}</div>}
      <div className="pills">
        {pills.map((p) => <span key={p.text} className={`pill ${p.level}`}>{p.text}</span>)}
      </div>
      <div className="orgs">
        {orgs.map((o) => <span key={o} className="org">{o}</span>)}
        {edge?.map((o) => <span key={o} className="org edge">{o}</span>)}
      </div>
      <div className="presence">
        <span><b>Mozilla:</b> {mozilla}</span>
        <span><b>HAI:</b> {hai}</span>
      </div>
      <details>
        <summary>Notes</summary>
        <ul>
          {notes.map((x, i) => <li key={i}>{x}</li>)}
          <li className="verdict">Verdict: {verdict}</li>
        </ul>
      </details>
    </article>
  )
}

export default function Details() {
  return (
    <article className="osai-dt">
      <div className="eyebrow"><Link href="/osai/overview">← Landscape</Link> · Companion to the one-pager</div>
      <h1 style={{ marginTop: 8 }}>Public Benefit AI: the map</h1>
      <p className="lede" style={{ marginTop: 12 }}>
        Eight boxes, drawn by what each produces, so the empty ones show. A map, not a census. Built to open one question: which areas of interest to all of us are under-served?
      </p>
      <div className="meta"><span>As of 2 Oct 2026</span><span>Items marked <Unv /> were not confirmed from a primary source</span></div>
      <div className="legend">
        <span className="muted">Crowding</span>
        <span><i className="swatch" style={{ background: 'var(--lv-empty)' }} />Empty</span>
        <span><i className="swatch" style={{ background: 'var(--lv-thin)' }} />Thin</span>
        <span><i className="swatch" style={{ background: 'var(--lv-split)' }} />Split</span>
        <span><i className="swatch" style={{ background: 'var(--lv-moderate)' }} />Moderate</span>
        <span><i className="swatch" style={{ background: 'var(--lv-crowded)' }} />Crowded</span>
        <span style={{ marginLeft: 8 }}><span className="mark m">M</span> Mozilla present</span>
        <span><span className="mark h">H</span> Stanford HAI present</span>
      </div>

      <h2 id="scope">Scope</h2>
      <p>Public benefit AI is work whose primary purpose is to make AI serve the public rather than a private return, where that purpose is protected by the organization&apos;s structure, and where AI is the center of the work. Something is on the map only if it passes all three tests.</p>
      <div className="scope">
        <div><h3>1. Purpose</h3><p>Public benefit is the mission, not a by-product. Meta&apos;s Llama is the most useful open-weight family in the world and is not public benefit AI. Ai2&apos;s OLMo is.</p></div>
        <div><h3>2. Structure</h3><p>Locked in by form: nonprofit, university institute, public agency, standards consortium, or a mission-locked company. The last kind (Anthropic&apos;s PBC and trust, the OpenAI Foundation, Mozilla Corporation) is on the map as a hybrid.</p></div>
        <div><h3>3. Centrality</h3><p>AI is a named program with its own people and budget, not a theme. This keeps off every foundation and think tank that merely has an AI angle.</p></div>
        <div><h3>Out of scope</h3><p>Commercial labs and their open weights (drawn at the edge, dashed, as gravity wells). Corporate responsible-AI teams. Startups with impact marketing. Digital-rights orgs with no dedicated AI program.</p></div>
        <div><h3>Geography</h3><p>Global in principle, US and Europe heavy in practice. Sovereign programs in Switzerland, Canada, Japan, Korea, India and Singapore are in where they are framed and funded as public goods.</p></div>
      </div>

      <h2 id="map">The map</h2>
      <p className="muted">Dashed chips are gravity wells, outside the boundary but shaping everything inside it. Open a box for the notes behind its verdict.</p>

      <div className="tier">
        <div className="tier-label"><span className="eyebrow">Build</span><span className="what">make public AI artifacts</span></div>
        <div className="grid">
          <Box n={1} title="Open models and code" level="split" m h output="Models, training recipes, open tooling"
            pills={[{ text: 'Open weights: crowded', level: 'crowded' }, { text: 'Fully open nonprofits: thin', level: 'thin' }]}
            orgs={['Ai2 (OLMo)', 'Swiss AI / Apertus', 'EleutherAI', 'LAION', 'OpenEuroLLM', 'Pleias', 'Japan GENIAC / LLM-jp', 'Korea Sovereign AI', 'IndiaAI', 'PyTorch Foundation', 'Agentic AI Foundation', 'Mila–Mozilla layer']}
            edge={['Llama', 'DeepSeek', 'Qwen', 'gpt-oss', 'Gemma', 'Mistral', 'Hugging Face']}
            mozilla="Mozilla.ai tooling (any-llm, llamafile, Otari), Mila foundation layer, Sep 2026" hai="Marin open lab (CRFM)"
            notes={[
              <>Ai2 is still shipping (Olmo 3.1 in Dec 2025, Olmo-core 3 on 2 Oct 2026) but lost CEO Ali Farhadi in Mar 2026, then him and 10+ researchers including OLMo co-lead Hannaneh Hajishirzi to Microsoft. Nathan Lambert left in Jun 2026. Holds a $152M NSF+NVIDIA program. Budget ~$50–80M/yr <Unv />.</>,
              <>Apertus (ETH Zurich, EPFL, CSCS) is the one public builder that scaled in 2026: CHF 20M plus 20M GPU-hours a year through 2028, Apertus 1.5 GA Sep 2026, 4M downloads.</>,
              <>OpenEuroLLM (€101M, 20 partners) is late and names compute as its binding constraint: 2B reference models, experimental 9B, no flagship.</>,
              <>National programs: Japan GENIAC (Rakuten AI 3.0 ~700B MoE, Apache 2.0; LLM-jp fully open), Korea&apos;s Sovereign AI Foundation Model project (phase 3; 1.56T tokens of public data opened Aug 2026), IndiaAI (38k GPUs, 12 teams), Canada&apos;s AI for All (~C$2B), Singapore&apos;s SEA-LION.</>,
              <>Open tooling has homes: PyTorch Foundation (vLLM, DeepSpeed, Ray) and the Agentic AI Foundation under the Linux Foundation (MCP, goose, AGENTS.md, A2A; 250+ members).</>,
              <>Mozilla&apos;s new bet: the Mila–Mozilla open-source foundation layer, 17 Sep 2026 ($5M from Mozilla, Hypertec $1M, Government of Canada). llamafile lives on at Mozilla.ai; Lumigator archived, any-agent deprecated.</>,
              <>Gravity well: Nvidia agreed to buy Hugging Face for $12.9B on 3 Sep 2026. The ecosystem&apos;s hub becomes a chip vendor&apos;s.</>,
            ]}
            verdict={<>plenty of open weights from companies and states. The fully open nonprofit bench is fragile: Ai2 wobbling, Apertus alone at scale, open post-training recipes &quot;further behind than ever.&quot;</>}
          />
          <Box n={2} title="Commons infrastructure" level="thin" m h output="Data, compute, evaluation, standards, serving"
            pills={[{ text: 'Thin, and thinning where it matters', level: 'thin' }]}
            orgs={['Common Crawl', 'Common Pile', 'Common Corpus', 'Mozilla Data Collective', 'Wikimedia', 'Internet Archive', 'Open Future', 'NAIRR', 'EuroHPC AI Factories', 'Isambard-AI', 'Alps (CSCS)', 'AI Index', 'HELM / FMTI', 'Epoch AI', 'MLCommons', 'METR', 'Public AI Inference Utility', 'Current AI', 'AI Alliance']}
            edge={['LMArena', 'Artificial Analysis', 'Scale SEAL']}
            mozilla="Data Collective, Common Voice, backer of the Public AI Network" hai="AI Index, HELM, Transparency Index, Marlowe cluster"
            notes={[
              <>Data: Common Crawl steady (2.17B pages, Sep 2026). Common Pile (8TB licensed) and Common Corpus (~2.27T tokens) are the licensed corpora. Mozilla Data Collective spun out in Apr 2026 as a UK company under the Foundation, raised $5M in Sep 2026, hosts 1,700+ datasets in 450+ languages. Wikimedia signed paid Enterprise deals with Amazon, Meta, Microsoft, Mistral and Perplexity. The Internet Archive is rate-limiting against bots.</>,
              <>Compute is government-led everywhere. NAIRR is still a pilot ($35M ops center Sep 2026; CREATE AI Act passed House Science 29–0, no floor vote). EuroHPC: 19 AI Factories, Gigafactories call Jul 2026. Isambard-AI (£225M) oversubscribed, now backing a £500M Sovereign AI Unit. Philanthropic compute is one-off: Huang Foundation $108M of CoreWeave credits, a CZI GPU call, Open Athena lending engineers and GPUs.</>,
              <>Evaluation is going commercial: LMArena at $1.7B (Jan 2026), Artificial Analysis and Scale SEAL venture or corporate. HELM went into maintenance mode 1 Jun 2026. The Transparency Index (Dec 2025) fell from 58 to 40. The international network of safety institutes dropped &quot;safety&quot; from its name in Dec 2025.</>,
              <>Serving: the Public AI Inference Utility serves Apertus and SEA-LION on donated compute, with library pilots in Utah, Georgia and New Jersey. Current AI has $400M committed against a $2.5B target and had deployed one $3.2M pilot cohort by Oct 2026; its Gap Map names inference bus factor, synthetic-data tooling, eval datasets and agent authorization as holes.</>,
            ]}
            verdict={<>the layer every other box depends on and almost nobody funds as such. Independent measurement shrinking, licensed multilingual data tiny, compute outside government anecdotal.</>}
          />
          <Box n={3} title="Public-interest products" level="empty" m h={false} output="AI the public actually uses: clients, assistants, agents"
            pills={[{ text: 'Near-empty', level: 'empty' }]}
            orgs={['Firefox Smart Window', 'Public AI utility chat', 'Current AI AlphaChat', 'Khanmigo', "Oak's Aila", 'Jacaranda PROMPTS', 'Code for America SNAP navigator']}
            edge={['Mozilla.ai Octonous']}
            mozilla="Firefox (nascent); 80% of 2026 spend is Firefox and Thunderbird" hai="none"
            notes={[
              <>No public-benefit organization ships a mainstream AI product to the general public.</>,
              <>Nearest attempts: Firefox Smart Window (beta Aug 2026, US/Canada English, Mistral models) and the Firefox AI kill switch (148, Feb 2026); the Public AI utility&apos;s chat; Current AI&apos;s AlphaChat (Jul 2026); Khanmigo ($4/month, free for teachers in 44 countries); Oak&apos;s Aila; Jacaranda&apos;s PROMPTS in 24 Kenyan counties; Code for America&apos;s SNAP Policy Navigator with Anthropic.</>,
              <>Mozilla.ai pivoted in 2025 from lab to revenue (CEO John Dickerson); Octonous and Otari are commercial. No Series A found through Sep 2026.</>,
              <>Mozilla&apos;s 2026 plan: ~$650M of spend, 80% Firefox and Thunderbird, 20% open-source and trustworthy AI, $1.4B in reserves.</>,
            ]}
            verdict={<>near-empty. This is the &quot;serving and interop, the real Mozilla move&quot; line in the one-pager. The organization best placed to fill it spends four-fifths of its budget elsewhere.</>}
          />
        </div>
      </div>

      <div className="tier">
        <div className="tier-label"><span className="eyebrow">Steer</span><span className="what">make AI safe and accountable</span></div>
        <div className="grid">
          <Box n={4} title="Alignment and safety" level="crowded" m={false} h={false} output="Safety research, evaluations, government institutes"
            pills={[{ text: 'Money: crowded', level: 'crowded' }, { text: 'People: thin', level: 'thin' }]}
            orgs={['METR', 'Redwood', 'ARC', 'FAR.AI', 'Resolution', 'Transluce', 'CAIS', 'Apollo', 'MATS', 'US CAISI', 'UK AISI', 'EU AI Office', 'Canada / Japan / Korea / Singapore AISIs', 'Coefficient Giving', 'FLI', 'SFF', 'Longview', 'Schmidt Sciences', 'ARIA']}
            edge={['Goodfire', 'Anthropic / OpenAI fellows']}
            mozilla="none" hai="none; Stanford's Center for AI Safety sits in Engineering"
            notes={[
              <>Independent labs are well funded and multiplying: METR (~$71M raised in six months to Aug 2026, no AI-company money), FAR.AI ($30M+, Jan 2026), Redwood, ARC (Paul Christiano back as ED Aug 2026), Transluce ($11M target), CAIS, EleutherAI. Resolution is the 2026 formation: Timaeus merged with the UK AISI alignment team, targeting 40–80 staff and $100–150M. Apollo reportedly converted to a PBC <Unv />. Conjecture closed Mar 2026. Goodfire is a company at $1.25B.</>,
              <>Government: UK AISI (£66M/yr, 100+ technical staff) is the stable one. US CAISI (~$55M) lost its director after three months in Jul 2026 and carries a second rename <Unv />. The EU AI Office enforces GPAI rules from Aug 2026 but high-risk obligations slipped to 2027–28.</>,
              <>Money: Coefficient Giving (Open Philanthropy&apos;s new name since Nov 2025) put ~$350–410M into AI safety and biosecurity in 2025 and plans ~$1B in 2026. Manifund projects $1.5–1.8B into AI-safety philanthropy in 2026 and counts $3.5B cumulative across 4,800+ grants.</>,
              <>Talent: MATS runs three cohorts a year of 120 fellows; Anthropic and OpenAI run safety fellowships.</>,
            ]}
            verdict={<>the best-funded box by far. Coefficient&apos;s stated bottleneck is grantmaker and senior-researcher capacity, not money. The US government arm is wobbling.</>}
          />
          <Box n={5} title="AI and society" level="split" m h output="Policy, rights, democracy, labor and economy, advocacy"
            pills={[{ text: 'Governance: crowded', level: 'crowded' }, { text: 'Labor and economy: thin', level: 'thin' }]}
            orgs={['AI Now', 'DAIR', 'Data & Society', 'Ada Lovelace', 'CDT', 'EPIC', 'Algorithmic Justice League', 'Partnership on AI', 'Berkman Klein', 'CSET', 'GovAI', 'IFP', 'RAND', 'Carnegie', 'Brookings', 'Encode', 'ARI', 'Stanford Digital Economy Lab', 'MIT Future of Work', 'OpenResearch', 'Economic Security Project', 'Windfall Trust']}
            mozilla="fellowships, Democracy x AI incubator, Humanity AI member; advocacy division cut Nov 2024" hai="policy pillar, Congressional boot camp, RegLab, Digital Economy Lab"
            notes={[
              <>Research and policy is dense: AI Now, DAIR, Data &amp; Society (AI Civics $3M; Worker Lens Sep 2026), Ada Lovelace, CDT&apos;s AI Governance Lab, EPIC, AJL, PAI (141 partners), Berkman Klein, CSET (&gt;$100M from Open Phil/Coefficient), GovAI, IFP, RAND CAST, Carnegie, Brookings. Stanford&apos;s Cyber Policy Center became the Tech Impact &amp; Policy Center in Sep 2025.</>,
              <>Advocacy has sharpened into legislation: Encode (California SB 53, New York RAISE), Americans for Responsible Innovation (anti-preemption), ControlAI, the AI Policy Institute.</>,
              <>Labor and economy is where evidence is thin. Stanford DEL&apos;s &quot;Canaries&quot; (updated Aug 2026): employment of 22–25-year-olds in AI-exposed jobs ~19% below counterfactual, via reduced hiring. AI Economic Indicators launched Jun 2026. Rockefeller&apos;s $100M &quot;Good Jobs for America&quot; (Apr 2026) is the largest dedicated program. ARI and Stanford DEL both say there is no adequate federal data on AI&apos;s workforce effects.</>,
              <>Mozilla Foundation cut 30% of staff and its advocacy and global-programs divisions in Nov 2024. What remains: a 2026 fellowship (10 × $100K), a Democracy x AI incubator (10 × $50K), Humanity AI membership.</>,
            ]}
            verdict={<>crowded on governance and principles, concentrated in DC, NYC and London. Thin on distribution, labor transition, and the question nobody owns: what people do all day when intelligence is abundant.</>}
          />
        </div>
      </div>

      <div className="tier">
        <div className="tier-label"><span className="eyebrow">Apply</span><span className="what">AI for public goods</span></div>
        <div className="grid">
          <Box n={6} title="Science and health" level="crowded" m={false} h output="Discovery, biology, global health"
            pills={[{ text: 'Money: crowded', level: 'crowded' }, { text: 'Rigor in LMICs: thin', level: 'thin' }]}
            orgs={['Arc Institute', 'FutureHouse', 'Open Athena', 'CZ Biohub', 'Schmidt AI2050', 'Astera Radial', 'DOE Genesis Mission', 'NSF OMAI', 'Gates Foundation', 'PATH', 'Jacaranda', 'Wadhwani AI', 'OpenAI Foundation']}
            edge={['Isomorphic', 'Lila', 'Periodic', 'Edison Scientific']}
            mozilla="none (Ersilia via Builders)" hai="discovery pillar, MedHELM, aging-in-place center"
            notes={[
              <>Science is the second-best-funded box. Arc Institute ($650M initial; Evo 2 in Nature, Mar 2026), FutureHouse (spun out for-profit Edison Scientific, Nov 2025), Open Athena (engineers plus compute for academic foundation models), CZ Biohub (acquired EvolutionaryScale; $500M Virtual Biology Initiative <Unv>secondary sources</Unv>), Schmidt Sciences (AI2050 2026 class: 28 fellows, $18M; AI in Science postdocs $148M), Astera&apos;s Radial (up to $500M over a decade). DOE Genesis Mission reached &gt;$5B across 278 projects in Jul 2026.</>,
              <>Health and development: Gates committed $1B over two years to equitable AI in Sep 2026 (40% health, 40% education), plus $200M with Anthropic and $50M Horizon 1000 with OpenAI. EVAH ($60M) exists because rigorous trials of AI clinical tools in LMICs barely exist.</>,
            ]}
            verdict={<>money abundant from government, mega-philanthropy and companies. The thin parts are evaluation and durability: pilots end the moment the donor leaves.</>}
          />
          <Box n={7} title="Education, government, journalism, civic life" level="moderate" m={false} h output="Public services and the information commons"
            pills={[{ text: 'Moderate, agenda set by lab money', level: 'moderate' }]}
            orgs={['Khan Academy', 'Common Sense Media', 'ISTE+ASCD', 'AFT AI academy', 'LEVI', 'Digital Promise', 'Oak National Academy', 'Code for America', 'UK i.AI', 'Stanford RegLab', 'Lenfest', 'Hacks/Hackers', 'Wikimedia', 'Internet Archive', 'Knight']}
            edge={['ChatGPT for Teachers', 'Claude for Education']}
            mozilla="none" hai="education pillar, federal-employee AI training"
            notes={[
              <>Education has operators but industry sets the agenda: the AFT National Academy for AI Instruction is funded by Microsoft, OpenAI and Anthropic ($23M); ISTE+ASCD&apos;s 6M-educator program is with Google; Khanmigo partners with Microsoft and Google. Independent: Common Sense Media&apos;s AI risk assessments, LEVI (350K students), Digital Promise ($26M), Oak. Under 2% of US federal education spending is R&amp;D.</>,
              <>Government capacity is shrinking in the US: USDS from ~230 to ~65 staff, DOGE terminated Jul 2026. Code for America published a 50-state AI landscape (May 2026). Stanford RegLab ran AI across 500M words of state statutes with NY, CA and MD.</>,
              <>Journalism: Lenfest&apos;s AI Collaborative (OpenAI doubled support Sep 2026), Hacks/Hackers, Knight&apos;s $3M. Wikipedia&apos;s human pageviews fell ~8%; Wikimedia and the Internet Archive say AI firms strain their infrastructure without paying.</>,
            ]}
            verdict={<>moderate. The operators exist; the money is mostly from labs.</>}
          />
        </div>
      </div>

      <div className="tier">
        <div className="tier-label"><span className="eyebrow">Cross-cutting</span><span className="what">money, coalitions, fellowships, accelerators</span></div>
        <div className="grid">
          <Box n={8} title="Funders, field-builders, talent" level="split" m h span
            pills={[{ text: 'Pledges: crowded', level: 'crowded' }, { text: 'Operators: thin', level: 'thin' }]}
            orgs={['Humanity AI', 'Current AI', 'Public AI Network', 'Coefficient Giving', 'Gates', 'OpenAI Foundation', 'McGovern', 'Schmidt Sciences', 'Omidyar', 'Siegel', 'Hewlett', 'Rockefeller', 'Knight', 'Mozilla Builders', 'Mozilla Ventures', 'Fast Forward', 'AI2050 fellows', 'MATS', 'HAI seed grants']}
            mozilla="Ventures, fellowships, Humanity AI member; Builders dormant since its one 2024 cohort" hai="Hoffman-Yee and seed grants, $60M cumulative"
            notes={[
              <>Coalitions: Humanity AI ($500M over five years; MacArthur and Omidyar co-chairs; Doris Duke, Ford, Kapor, Lumina, Mellon, Mozilla, Packard, Siegel) made its first grants in May 2026: &gt;$18M to 12 coastal grantees at ~$500K each, plus a $10M open call; still hiring an executive director seven months after launch. Current AI: $400M committed, ~$3.2M deployed. Public AI Network: 350+ members.</>,
              <>Philanthropies: Gates ($1B over two years), Coefficient (~$1B in 2026), OpenAI Foundation ($25B pledged, ~$200M disbursed, $50M People-First AI Fund to 208 nonprofits), McGovern ($75.8M in 2025; $500M per decade), Schmidt Sciences, Hewlett ($100M Emerging Technology &amp; Security), Rockefeller ($100M jobs), Omidyar (~$30M generative-AI portfolio).</>,
              <>Field-builders and talent: Mozilla Builders ran one accelerator cohort (Sep–Dec 2024, 14 projects, up to $100K each) and appears dormant since. Mozilla Ventures ($35M, 55+ investments). Fast Forward&apos;s 2026 cohort is 7 of 10 AI. AI2050, HAI&apos;s Hoffman-Yee and seed grants, MATS, Anthropic and OpenAI fellows.</>,
            ]}
            verdict={<>crowded in pledges, thin in operators. Coefficient has more fundable work than it can evaluate; Humanity AI funded &quot;the usual suspects&quot;; Current AI has deployed under 1% of commitments in 20 months.</>}
          />
        </div>
      </div>

      <h2 id="money">Money map</h2>
      <p className="muted">Orders of magnitude for 2026, to show where dollars pool. Pledged and annual figures are mixed, so this is not drawn to scale.</p>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Box</th><th>Scale</th><th>Who pays</th></tr></thead>
          <tbody>
            <tr><td>4. Safety</td><td>~$1.5–1.8B philanthropy projected for 2026; ~$55M US CAISI; £66M UK AISI</td><td>Coefficient, OpenAI Foundation, Longview, Macroscopic, SFF</td></tr>
            <tr><td>6. Science and health</td><td>Multiple $B: Genesis &gt;$5B, Gates $1B/2y, Arc $650M, Astera $500M/decade</td><td>Government, mega-philanthropy, companies</td></tr>
            <tr><td>2. Compute</td><td>Government: EU gigafactories, UK £725M, Swiss CHF 20M/yr; US NAIRR unlegislated; philanthropy ~$100M one-off</td><td>Governments</td></tr>
            <tr><td>5. Society</td><td>Humanity AI $100M/yr pledged ($18M out); McGovern ~$75M/yr; Hewlett $20M/yr; Rockefeller $33M/yr</td><td>Legacy foundations</td></tr>
            <tr><td>1. Open models</td><td>Apertus CHF 20M/yr; Ai2 ~$50–80M/yr <Unv />; OpenEuroLLM €101M total; Mozilla ~$130M/yr across all AI</td><td>Universities, states, Mozilla</td></tr>
            <tr><td>7. Education and civic</td><td>AFT $23M, LEVI $40M, Digital Promise $26M, Lenfest ~$10M; Gates education share ~$400M</td><td>Mostly AI labs</td></tr>
            <tr><td>8. Field and talent</td><td>Large pledges, small deployment</td><td>Everyone, slowly</td></tr>
            <tr><td>3. Products</td><td>No dedicated funding found</td><td>Nobody</td></tr>
          </tbody>
        </table>
      </div>

      <div className="two">
        <div>
          <h2 id="gaps">Under-served, ranked</h2>
          <ol className="ranked">
            <li><div><b>The public-interest product layer (box 3).</b> Nobody ships. The need is an open client that routes across models with a public-interest default. Mozilla is the natural owner and spends 80% on the browser.</div></li>
            <li><div><b>Independent measurement (box 2).</b> HELM in maintenance, LMArena commercial, transparency falling. Cheap relative to models, and HAI already owns the AI Index.</div></li>
            <li><div><b>Licensed, multilingual data commons (box 2).</b> Wikimedia and the Internet Archive strained; Mozilla Data Collective is the live vehicle; Current AI&apos;s language pilot is $3.2M. Korea&apos;s public data release is a model other states could copy.</div></li>
            <li><div><b>Public compute outside government (box 2).</b> NAIRR unlegislated, OpenEuroLLM compute-starved, philanthropy one-off. Open Athena&apos;s &quot;lend engineers and GPUs&quot; is the only institutional pattern.</div></li>
            <li><div><b>Labor transition, distribution, meaning (box 5 and nowhere).</b> No federal workforce data; effects show up in entry-level hiring. No institution owns &quot;what will people do all day.&quot; This is the &quot;now what&quot; question.</div></li>
            <li><div><b>Fully open model recipes (box 1).</b> Ai2&apos;s core left for Microsoft; Apertus is the only scale-up; Europe is late. The recipe matters more than any one model.</div></li>
            <li><div><b>Operators and grantmakers (box 8).</b> Coefficient cannot evaluate what it could fund; Humanity AI took seven months to hire a director; Current AI has deployed under 1%. The scarce input is people who can run programs.</div></li>
          </ol>
        </div>
        <div>
          <h2>Crowded: not without a twist</h2>
          <ul className="plain">
            <li>Technical safety research funding (box 4).</li>
            <li>Governance and policy shops in DC, NYC and London (box 5).</li>
            <li>AI-for-biology mega-institutes (box 6).</li>
            <li>Teacher AI training funded by labs (box 7).</li>
          </ul>
          <h2>Questions to open with</h2>
          <ol className="q">
            <li>Does the boundary hold? Purpose, structure, centrality. Where do mission-locked companies belong?</li>
            <li>Which boxes do we have unfair advantages in? Mozilla&apos;s inheritance is product and community; Stanford HAI&apos;s is measurement and convening; builder programs and shipping are the third.</li>
            <li>Is &quot;operators, not dollars&quot; the real gap? If yes, the move is a builders program or field vehicle, not another fund.</li>
            <li>Is the client layer a Mozilla move that Mozilla will not make? Can it be made outside Mozilla with Mozilla&apos;s blessing?</li>
            <li>What does Korea and the wider Asian sovereign-AI effort look like from inside Korea, and is it on anyone&apos;s map in the West?</li>
            <li>Who owns the &quot;now what&quot; question: time, distribution, meaning? Nobody on this map is a box for it.</li>
          </ol>
        </div>
      </div>

      <div className="sources">
        <h2 id="sources">Sources and caveats</h2>
        <p>Compiled 2 Oct 2026 from three web research passes. A few org sites blocked fetches (mozillafoundation.org, the HAI people page). Not found despite trying: Mozilla&apos;s official headcount, Mozilla Ventures&apos; current managing partner, budgets for CAIS, Apollo, Redwood and ARC, HAI&apos;s annual budget, whether Humanity AI&apos;s $10M open call opened. Ask the assistant for the link behind any claim; it has the full text with every source.</p>
      </div>
    </article>
  )
}
