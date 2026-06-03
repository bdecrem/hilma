# Plan: "Claude Code for the Macintosh Plus"

A full **Claude Code–style coding agent** that runs on the Mac mini and is delivered to the Mac Plus
over the RetroWiFi-SI / `socat` link. It should *feel like Claude Code* — same mental model, same
agentic loop, same transparency and slash commands — just **rendered for a VT100 at 9600 baud on a
512×342 mono screen**. The first marquee use is writing/knowledge work over `../docsrepo`, but the
tool is a **general code agent** (files, search, edit, shell, git) and should grow that way — do not
scope it down to knowledge work.

## Status

**MVP BUILT & verified on the iMac (2026-06-02).** Code in `agent/` (`src/teletype.ts`, `src/main.ts`);
run instructions in `agent/README.md`. Verified end-to-end against `docsrepo` and a scratch dir: SDK
connection, `claude_code` preset + Plus output rules, read-only tools auto-run with `* tool` lines,
writes/bash gated by a `[y/N/a]` prompt (deny blocks; `a` = allow-for-session), wrapped ASCII output,
multi-turn + slash commands. Permission gate is a **PreToolUse hook** with `settingSources: []`
(canUseTool turned out to be only a fallback that never fired). Not yet deployed to the mini (needs
`ANTHROPIC_API_KEY` on the mini + swapping the socat listener from `login` to the agent).

## Requirements (brief, with Bart's decisions folded in)

1. Runs on the **Mac mini**.
2. Delivered to the **Mac Plus** via the "modem" link (RetroWiFi SI → TCP `:2323` → `socat`).
3. Assume **9600 baud** typically — but baud is a first-class, tunable config value, not a constant.
4. A **full code agent** (read/grep/edit/write/bash/git over a repo) — knowledge/writing is the first
   *use case*, not the *ceiling*.
5. Initial working directory / corpus: **`../docsrepo`** (switchable later).
6. **Read + write** from day one (gated by a Claude-Code-style permission prompt).
7. **Look, feel, and workflow ≈ Claude Code** — "Claude Code for the Mac Plus."
8. **Reuse** the agents already built in `hilma` and `../vibeceo8`; build in **TypeScript** (Claude Code is TS).
9. Start with a **simple MVP** on a **scalable architecture**.
10. **It's all about the Plus's baud rate and screen resolution** — that constraint drives the rendering.

## The two ideas that make it work

**(A) It literally is Claude Code's engine.** The brain is the **Claude Agent SDK**
(`@anthropic-ai/claude-agent-sdk`, TS) — the same engine inside Claude Code. So we don't *imitate*
Claude Code; we **run it and re-skin its output for a VT100**. We inherit the agentic loop, the full
toolset (Read/Grep/Glob/Edit/Write/Bash), permissions, todos, and context management for free. Tools
run **on the mini at mini speed**; only the conversation crosses the slow link.

**(B) One layer owns the Plus's limits; nothing else knows about them.** All the Mac Plus reality —
**9600 baud ≈ 960 B/s**, **~80×24 mono** (configurable to 64/40 for a bigger font), **VT100, no color** —
lives in a single **Teletype layer** that wraps to width, strips to ASCII, converts markdown→plain, and
pages. Reconciles #7 and #10: Claude Code is normally a rich full-screen TUI; we render its *same model*
as clean **line-mode ASCII**, because that's what the screen and baud allow.

```
Mac Plus (VT100 dumb terminal)
   │  bytes in / ASCII out  (9600 baud)
   ▼
socat :2323 ──execs──▶ claude-plus (Node/TS on the mini)   ← dial-in lands STRAIGHT here (decision)
                          ├─ Transport   stdin/stdout = the TCP socket (swappable: nc / local for tests)
                          ├─ Teletype    ◀── THE Plus layer: wrap-to-width · ASCII-ify · md→plain · page · pace
                          ├─ UX shell    Claude-Code feel: greeting · `> ` prompt · ● tool lines · y/n perms · /slash cmds
                          └─ Agent SDK   full Claude Code toolset over cwd=../docsrepo (read+write+bash), mini-speed
```

**Dial-in behavior (my call):** the Plus drops **straight into the agent** (the "Claude Code for Mac
Plus" magic), with a `/shell` (or `/exit`) escape hatch to a plain zsh if needed.

## Look & feel: Claude Code, in ASCII line-mode

Mirror Claude Code's *interaction model*, presented as line-oriented text (no full-screen redraw):
- **Greeting** on connect: a small ASCII banner + `cwd: ../docsrepo`, model, tips line.
- **Prompt:** `> ` — type a request in natural language, same as Claude Code.
- **Tool transparency:** each tool call shows as a terse one-liner the way Claude Code does, e.g.
  `● Search "spinoza" in docsrepo` / `● Read notes/agi.md` / `● Edit draft.md (+12 -3)` / `● Bash: git status`.
  Raw tool output stays on the mini; only a short result/summary line crosses the link.
- **Permissions:** Claude Code's approval gate, rendered as a line prompt — `Allow Edit draft.md? [y/N/a]`
  (a = always for this session). Read-only ops auto-allowed; writes/bash ask.
- **Streaming answer:** Claude's prose streams in append-only, wrapped to `cols`, paged at `--More--`.
- **Slash commands:** `/help /clear /model /cwd /cols /save /shell /quit` (familiar to Claude Code users).
- **Todos/plans:** when Claude makes a plan, render it as a simple numbered ASCII checklist that updates
  by re-printing (not a live-updating box).

Net: a Claude Code user sits down at the Plus and immediately knows how to drive it; it just looks like 1986.

## Reuse map (not reinvention)

| Need | Reuse from |
|------|-----------|
| Agent-SDK loop + in-process tools (TS port of the shape) | vibeceo8 `amber-email/agent.py`, `kg-query/agent.py` |
| Prompt-caching for cheap long sessions | hilma `src/lib/f2/chat.ts`, `src/lib/feynd/ask.ts` |
| Conversation/thread state + context assembly | hilma `src/lib/f2/threads.ts`; vibeceo8 `sms-bot/lib/{orchestrator,context-loader}.ts` |
| Persisted artifacts (transcripts/drafts) | vibeceo8 `sms-bot/lib/agents/report-storage.ts` |
| Permission tiers (if multi-user later) | vibeceo8 `amber-email/agent.py` |

Default model **`claude-sonnet-4-6`** (haiku-4-5 for a fast/cheap `/model` option).

## The baud + screen budget (rules the Teletype layer enforces)

- 9600 8N1 = **960 B/s**. Full 80×24 repaint ≈ **2 s** → **never redraw; append-only streaming.**
- Paragraph (~400 chars) ≈ 0.4 s — fine. Page (~1540 chars) ≈ 1.6 s — fine **with paging**.
- ASCII only (transliterate smart quotes / em-dash / • / box-drawing); strip ANSI color; hard-wrap to
  `cols`; page every `rows-2` lines; **summarize, never dump** files; markdown→plain (headings UPPERCASE,
  `**bold**`→plain, code blocks indented). Optional pacing so a burst can't overrun the Plus's buffer.
- **Tool activity stays on the mini** — at most a `● …` one-liner crosses the link. Single biggest baud saver.

## MVP (Phase 0 — small, end-to-end, testable from the iMac before the Plus link is done)

A single `claude-plus` Node/TS program:
1. **Transport:** stdin/stdout (so `socat … EXEC:'node claude-plus'` lands the Plus straight in it; same
   binary runs over a local pipe / `nc` for testing).
2. **Teletype:** wrap (`cols`=80) · ASCII-ify · md→plain · page (`rows`=24). Config `{cols,rows,model,cwd}`.
3. **Agent (full Claude Code toolset):** Agent SDK `query()` loop, `cwd=../docsrepo`, Read/Grep/Glob auto-allowed,
   Edit/Write/Bash behind the y/n permission line. System prompt: "you are Claude Code on a slow Mac Plus
   VT100 terminal — terse, ASCII, ≤cols wide, summarize don't dump; this is a real code agent."
4. **UX shell:** greeting, `> ` prompt, `● tool` lines, permission prompts, `/help /clear /quit /shell`.

**Test now from the iMac** (no Plus needed): `node claude-plus --cols 80`, then over `nc` to a local `socat`,
to tune wrapping/paging/permission flow before the serial link exists.

## Roadmap (Phase 1+ — make it solid)

- `/save` transcripts + a dated session journal artifact on the mini.
- More slash commands & modes; runtime `:cols/stty` size detection; pacing dial keyed to baud.
- Semantic search tool (embeddings index of the working dir) beyond grep.
- Multiple working dirs + `/cwd` switch (docsrepo, hilma, Now What notes, any repo).
- Session persistence/resume; corpus prompt-caching for cheap long sessions.
- Git-aware flows (status/diff/commit summaries rendered terse).
- Auth/permission tiers if ever exposed beyond the LAN; telnet NAWS window-size negotiation; higher baud.

## Decisions (locked)

- Corpus / initial cwd: **`../docsrepo`** — but build as a **general code agent**, not knowledge-scoped.
- **Read + write** from the MVP (writes gated by a Claude-Code-style y/n prompt).
- Dial-in lands **straight in the agent**, with a `/shell` escape.
- **Feel = Claude Code**, rendered line-mode ASCII for the VT100.

## Effort note

Worth **Extra High** when we build it — Agent SDK + streaming + terminal rendering + permission UX +
socat integration at once. The MVP is small; the care is in the Teletype layer, the permission prompts,
and the system prompt that makes Claude behave well on a 960 B/s mono line.
