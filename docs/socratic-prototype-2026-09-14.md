# Socratic prototype — what was built, 2026-09-14/15

A Socratic law-tutor prototype for the study Daniel Chen is putting together with Kathy Zeiler (BU Law, Torts). Built from the material in `misc/daniel-chen/` in one session; live at **hilma-nine.vercel.app/socratic**.

## What the source folder had

- `daniel-chen.txt` — Bart's meeting notes: a "Socratic LLM", a three-month goal of an artifact plus a randomized comparison of students using a plain LLM vs Socratic LLM variants (A/B/C), experimental-economics style, likely on oTree; Zeiler's ~230-student class as the population.
- `Zieler Lecture Transcript.docx` — about 20 minutes of verbatim class dialogue: Zeiler teaching negligent entrustment through the employer-as-entruster hypothetical, with cold-calls and her corrections.
- `Creation Prompts.docx` — the log of the Claude session that turned the transcript into a script. Its main value is what it says is missing: the lecture covers three topics, the transcript only the first.
- `Student Prompt.txt` — the finished "paste this into Claude" study script: doctrine, the hypothetical, her nine method moves, a four-step protocol, an 11-question bank with model answers, four mastery criteria, tone.

That script's branching rules are a state machine, its answer taxonomy is a classifier, and its question bank is a rubric — which is what makes it buildable as an app with measurement rather than a paste-in prompt.

## What exists now

**Student side** — `/socratic`. Start page (participant code, study condition, begin), then the session: the tutor speaks first with the overview, asks "ready?", then works the hypothetical. A phase stepper (Overview → Ready? → Questions → Mastery) and four mastery chips (Holding, Structure, Both sides, Line-drawing) sit in the header for the Socratic arms. Replies stream. Sessions resume on reload and can be ended. A study platform would link to `/socratic?pid=<code>&arm=<A|B|C>`; there are no accounts.

**Three arms per session**
- **A · Assistant** — explains and answers directly. The control.
- **B · Socratic** — the study script as the system prompt: overview → readiness check → questioning with the moves (commit to a position; "a list of facts is never an argument"; the three-strategy scaffold only once stuck; argue the other side; line-drawing; sympathetic group; name the skill afterwards; hold the duty/causation boundary; recap) → mastery check.
- **C · Socratic + coach** — B, plus a second agent: the observer's read of each student message is appended for the tutor as a `<coach>` block it is told to follow. The multi-agent variant from the notes.

**Observer** — `claude-sonnet-5`, low effort, runs on every student message in every arm and logs: answer type (list_of_facts, bare_conclusion, hedge, argument, counter_argument, line_drawing, sympathetic_group, element_conflation, doctrinal_error, stuck, …), reasoning quality 0–3, doctrinal error, recommended next move, a one-line rationale. This is the per-turn measurement the study needs; only arm C shows it to the tutor.

**Tutor** — `claude-opus-5`, effort medium, structured output `{ reply, phase, move, student_answer, mastery }`, so every reply also logs where the protocol is, which move it made, how it read the student, and the mastery flags. The 15k-token prompt is cached after the first turn. Overview ≈ 14 s, replies 3–8 s.

**Storage** — `soc_sessions` and `soc_turns` in the Supabase project (`apps/socratic/schema/001_socratic.sql`, applied). Every turn keeps content, the self-report or verdict, the coach note, token usage, latency and model.

**Researcher view** — `/socratic/sessions?key=…` lists every session (arm, phase, student messages, mastery n/4); `/socratic/sessions/<id>?key=` shows metrics (messages, mastery, mean reasoning quality, first real argument, lists of facts vs corrections, latency) and the transcript with a verdict chip under each student message, the move under each tutor reply, and the coach note. The key is `SOC_ADMIN_KEY` in `.env.local` and on Vercel.

**Code** — `src/lib/socratic/` (content module + transcript, arms, prompts, tutor, observer, store), `src/app/socratic/` (UI, OG image, researcher pages), `src/app/api/socratic/` (three routes; the turn route streams server-sent events), `scripts/socratic/pw-check.mjs` (headless phone-sized driver). Documented in `CLAUDE.md` under "Socratic".

## What was verified

Driven headlessly at phone size, locally in all three arms and then once on production:

- B and C: the tutor gives the overview, asks "ready?", and when the student answers with the classic list of facts ("she knew he was a bad driver, she knew the money would go to the car, she paid him anyway, so she's liable") it says, in substance, *that is a list of facts, and a list of facts is never an argument*, and demands the connection. The observer read that answer as `list_of_facts` (once as `bare_conclusion`, both quality 1) and recommended `facts_not_argument`; the tutor's logged move was `facts_not_argument`.
- C's coach demonstrably steers: after "Ready." it recommended `commit` and the tutor demanded a position, where B's tutor asked for the holding first.
- A answers "just tell me the answer" fully, as a control should.
- Reload resumes the session with the same turns. Build passes. Four sessions (pw-a, pw-b, pw-c, prod-check) are kept in the table as examples.

## Auth and the credit wall

- Local runs on OAuth now: the Anthropic CLI (`ant`, installed via Homebrew) is logged in as bdecrem@kochi.to to the Kochito Labs org; `SOC_PROFILE=default` in `.env.local` makes the app use that profile, and the SDK (bumped 0.90 → 0.125 for this) then ignores `ANTHROPIC_API_KEY` on purpose. Verified: a request with a bogus key in the environment authenticates as Kochito Labs. Production keeps using Vercel's key.
- OAuth is a credential, not billing. As of 2026-09-15 every org in reach is out of API credit: Kochito Labs (the OAuth login and hilma's `.env.local` key), the org behind the vibeceo sms-bot key (worked for the local runs, then ran dry), and whichever org Vercel's key belongs to (production worked on 2026-09-14, out by the 15th). Nothing runs until one of them has credit; then local and production work with no further change.
- **2026-09-15, local mode on the subscription:** `SOC_BACKEND=claude-code` routes the tutor and the observer through the Claude Code CLI on Bart's iMac (`src/lib/socratic/claude-code.ts`), which runs on his Max plan. Same prompts, same structured output, same streaming and logging; verified end to end in arm C (overview, commit, the list-of-facts correction, coach notes, cache hits on resumed turns). So the prototype can be tried and iterated on locally with no API credit; production still needs credit.
- Rough cost: a 20-turn session ≈ $0.45 (tutor ≈ $0.40, observer ≈ $0.05). 230 students through one module is on the order of $100.

## Open for the study

- One topic. The rest of the lecture (Carter v. Kinney / Heins v. Webster County; Broadbent parental immunity) is on Daniel's or Kathy's side, not in the repo.
- No outcome measure or pre/post test yet; the observer's per-turn verdicts are the raw material, and its labels vary on borderline answers, so it wants calibrating against a fixed example set.
- Whether the tutor lives inside oTree or oTree only randomizes and links out (`?pid=&arm=` is ready for the second).
- The tutor knows the real Vince v. Wilson beyond the module (arm A cited the 1989 Vermont facts). Fidelity to the module isn't enforced.

## Machine notes picked up on the way

`pnpm` isn't on the shell PATH here (`npx -y pnpm@10.8.1 …` and `npx next …` instead); the Supabase CLI was being SIGKILLed on launch and was fixed by re-signing the binary ad hoc; `scripts/db` is SELECT-only, DDL goes through `supabase db query --linked`. All in the session memory notes.
