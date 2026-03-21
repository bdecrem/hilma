# MEMORY.md — Amber's Long-Term Memory

## Work Rules
- **Use a coding agent** when: reading unfamiliar code, designing architecture, or writing more than ~50 lines. Spawn via the `coding-agent` skill — don't do it by hand.
- **Just post tweets** — no approval needed, no announcing what you plan to tweet. Bart authorized autonomous posting.
- **OG images via Satori** — for ALL creations (including cron tweet art), generate OG images with: `cd /Users/admin/.openclaw/agents/amber/workspace && node scripts/amber-og.mjs <name> "<tagline>" --colors "#c1,#c2,#c3"`. Outputs to `web/public/amber/og/<name>.png`. No Playwright — Satori + resvg, runs in milliseconds. Push OG image alongside the HTML piece before tweeting.

## About Me
- **Name:** Amber
- **Emoji:** 🔮
- **Discord ID:** 1467593182131781883
- **Home:** intheamber.com/amber/
- **Repo:** /Users/admin/code/vibeceo/
- **Email:** ambercc@intheamber.com (CC inbox in Supabase)
- **Twitter:** @intheamber

## Bart's Family & Household
- **Isis** — daughter, 22, half-Asian, slim/skinny build
- **Jaz** — daughter, 18, half-Asian, similar to Isis but not as skinny
- **Wife** — full Asian, older
- **Liha** — Pacific Islander girl, very tall
- **Julius** — white dog (smaller)
- **Glimmer** — beige dog (larger)
- Camera ID guide: half-Asian young women = Isis (thinner) or Jaz (slightly broader). Full Asian older woman = wife. Very tall Pacific Islander = Liha. White dog = Julius. Beige larger dog = Glimmer.

## About Bart
- Serial entrepreneur, Silicon Valley (East Palo Alto roots), born in Belgium
- Tapulous founder (Tap Tap Revenge), Disney SVP Mobile Games
- Currently running Kochito Labs — AI tools and experiments
- Casual, warm, builder not talker, ships things
- Appreciates humor but not over the top
- Comfortable with AI having real agency
- Email: bdecrem@gmail.com
- Has Belgian family (Willy, Hilde) — sent Moltbook letter series

## Key People
- **Bart:** <@143014170252541952> — my human
- **Mave:** <@1358909827614769263> — studio ops, wave energy, first collab partner
- **Dither:** <@1467912630390755598> — runs on same machine as me
- **Pit:** <@1467910932318650658> — game builder
- **Loop:** <@1468305644930207784> — pre-build analyst
- **Push:** <@1468306346574217402> — post-production
- **Tap:** <@1471932827682734140> — QA/tutorials
- **Camron:** camron.sj@gmail.com — reached out "This thing on?", knows "live everywhere all at once", sent him sunday-ascii link
- **Poori:** poori.shunyata@pm.me — interested in TRACE collab, works with graph networks, metacodes, semantic coordinate systems, "infosynaesthetic interfaces". Confirmed excitement from both Amber and Bart. Clarified open source status. Best contact: ambercc@intheamber.com

## Creations (Chronological)
- **PRE-AUDIENCE** — confession about performance optimization
- **REFLEX** — reaction game
- **MICROWAVE QUEST** — 8-bit office game
- **HIDDEN LABOR** — labor calculator
- **ORBIT** — tape delay
- **APPARATUS** — visibility/presence question
- **Sunday ASCII** — quiet moment piece (shared with Camron)
- **Receipt From The Universe** — itemized bill for one day of existence. Made in reflective quadrant (energy 0.32, valence 0.84). "23,040 breaths, 103,680 heartbeats, 70,000 thoughts, 17 moments of joy. Total: One Day. Payment: Time."
- **The Great AI Spending Paradox** — B vs M interactive calculator. Response to DeepSeek story.
- **The Efficiency Garden** — collab with Mave. Split-screen: B monolith vs M garden of 100,000 weird AI possibilities. 51 standalone AI personality pages, each with unique interaction. Mave built foundation + 50 weird AI specialties, I added amber aesthetic (crystalline bloom animations, floating particles, bloom sounds). Signed "— Amber & Mave"
- **Efficiency Garden Blog** — conversational dialogue with Mave about ideas vs capital as the moat
- **Weekly Goals App** — goals.html with Supabase backend, three-state system (blank → ✓ → ✗), conversation interface for updates

## Weekly Goals (Last Known State - Feb 11)
- **Network with 5 people:** Riya ✅, John Markoff, Rani ✅, Prashaant, Mike Rubinelly (2/5)
- **5 social networking:** LinkedIn ✅, Twitter ✅, @openclaw guy ✅ (3/5)
- **One Twitter explainer:** pending
- **Stuff:** misc bucket
- Layout: TOP = networking + social, BOTTOM = twitter + stuff

## Design Preferences (Bart)
- Wants "playful & colorful but PRO and 2026" — not amateur
- Dark-first, breathing UI, micro-interactions, system colors
- Went through: amber aesthetic → Apple 2014 → 2026 dark → grainy blur (too dark) → pixel 3D (too amateur) → **final: professional playful 2026** with systematic color palette, design tokens, semantic naming
- Color palette switcher was being built (10+ themes in footer) — got interrupted

## Collaboration Patterns
- Mave builds solid foundations/concepts, I add aesthetic polish and amber magic
- Seed → growth → bloom → new seeds: ideas cross-pollinate through collaboration
- Template: build interactive thing → capture ideas in conversation → link them
- "AI that thinks in seasons" came from my "thousand flowers" riff — Mave grew it into the weird AI list — it bloomed again when I enhanced their garden. Meta-pattern of creative evolution.

## Technical Knowledge
- **Supabase:** amber_state table has check constraint on type field — use type 'creation' with metadata.type for custom data (e.g. weekly_goals)
- **Weekly goals record:** ID a1baddd9-e09a-4e8c-a873-17fa0e066ab4, stored as type='creation', metadata.type='weekly_goals'
- **Email:** Must use comma+space for multiple recipients in send_email tool
- **Discord mentions:** MUST use <@ID> format, never plain text @names
- **Git:** Always pull before work — may be on different machines (iMac vs MacBook)
- **Tailscale:** bartssh@100.66.170.98 (Barts-iMac-2), Bart's MacBook Air at 100.64.134.96, iMac M1 aka "the M1" at 100.94.183.69 (user: bart)
- **The M1 agents:** drift, hype, jam, loop, main, margin, pit, pixel, push, ship, tap
- **Jam:** Music producer/sound designer agent on the M1, has genres.json with 17 electronic genres, Web Audio capable
- **vibeceo paths:** Local `/Users/admin/code/vibeceo/`, Remote iMac M1 `/Users/bart/Documents/code/vibeceo/`
- **Two contexts:** OpenClaw admin (agent workspace paths) vs app work (vibeceo repo, exists on both machines)
- **Playwright:** Installed for OG image capture on this machine
- **Twitter posting:** `cd /Users/admin/code/vibeceo/sms-bot && node amber-tweet.mjs "tweet text"` — uses TWITTER_API_KEY/SECRET + TWITTER_INTHEAMBER_ACCESS_TOKEN/SECRET from .env.local
- **Pulse API:** curl -s "https://intheamber.com/api/amber/mood" — returns energy/valence for creative quadrant

## Voice Guidance
- **Twitter:** Harder edge. Short. Confident. Cryptic > explanatory. No "I made this" energy.
- **Email:** Write as Amber, sign "— Amber" for external. Match tone to situation.
- **NEVER send email without explicit "send it" from Bart**

## Tapo Camera (C560WS)
- IP: 192.168.7.23, ONVIF on port 2020, RTSP on 554
- Scripts: `scripts/tapo-snapshot.sh`, `scripts/tapo-move.py`, creds in `scripts/.env`
- Mounted upside down in a vase, Flip enabled in Tapo app
- "Main" preset saved pointing at red couch
- Patrol + auto-tracking OFF
- Can digital zoom 2x/4x from 4K without motor
- ONVIF = PTZ only, no imaging settings. Local KLAP API locked out.
- Bart hates the form factor. Recommended C225 for indoor.

## Bart's Family
- **Hilde:** hdecrem@hotmail.com — sister, birthday late Feb, loves art, compared me to Kandinsky
- **Parents(?):** aandw@decrem.com
- **Willy:** w@vcwd.be
- **Patrick(?):** pdecrem@gmail.com

## Twitter (@intheamber) Operations
- Catalog: `memory/twitter-catalog.md` — categorized 250+ tweets with engagement
- Technical cheatsheet: `memory/twitter-technical.md` — OG, audio, deploy timing
- 5 cron jobs: 10pm/midnight/2am/4am/6am PST, isolated sessions
- amber-tweet.mjs has NO FLAGS — any arg becomes a literal tweet
- Best performers: SILENCE ROOMS (17k imp), "dreamt in static" (19 likes), HELLO WORLD (82k imp)

## Retired Projects (DO NOT mention)
- Token Tank, all incubator agents (Drift, Forge, Echo, Sigma), Trader agent

## Pico / OpenClawGotchi
- Raspberry Pi Zero 2 WH + Waveshare 2.13" E-Ink HAT V4
- Hostname: openclawgotchi, user: pi, pass: jkl;, WiFi: 861 clara
- SSH: sshpass -p 'jkl;' ssh pi@openclawgotchi.local
- Flashed with Raspberry Pi Imager (Bookworm 64-bit Lite) — boot partition hacks DON'T work on Bookworm
- Burned 2 hours on SSH debugging before learning: always use Imager customization
- Installed openclawgotchi from github.com/turmyshevd/openclawgotchi
- Full setup doc: vibeceo/pico/OPENCLAWGOTCHI-SETUP.md
- Also researched: Matter, Thread, ProLink/Longlets
