// "Ask Ola": the conversation, in a drawer beside the things (a sheet on a phone).
// A request, then the run in plain-word steps (details on request), then the answer. Approvals,
// errors and a lost connection are said out loud, never swallowed.
import { createEffect, createResource, createSignal, For, onCleanup, Show } from 'solid-js'
import type { Ola } from '../lib/ola.ts'
import type { CompareInfo, CompareResultLine, Fallback, Problem, Question, Step, Turn } from '../lib/types.ts'
import { runSummary } from '../lib/conversation.ts'
import { JOB_PROPOSED } from '../lib/steps.ts'
import { COMMANDS, commandMatches, parseCommand, reactionOnly, REACTIONS, shown, turnReaction, type CommandName } from '../lib/commands.ts'
import { clock, when } from '../lib/format.ts'
import { Answer } from './Answer.tsx'
import { Icon } from './Icon.tsx'
import { StretchCard } from './StretchCard.tsx'
import { canOpen, compare, desk, plainPath } from '../lib/api.ts'
import { CompareLine, CompareSheet } from './Compare.tsx'

// Requests that work in any project, empty or not: nothing here names a file the person may not have.
const STARTERS = ['Make a hello world web page', 'Make a one-page site that says what our group does and when we meet', 'Look at the files I uploaded and tell me what is in them']

export function Drawer(props: { ola: Ola; open: boolean; onClose: () => void; onAddFiles: () => void; onFiles: () => void; draft: string; setDraft: (s: string) => void; inputRef?: (el: HTMLTextAreaElement) => void }) {
  const s = () => props.ola.state
  const working = () => {
    const t = s().turns[s().turns.length - 1]
    return !!t && (t.status === 'working' || t.status === 'sending')
  }
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => working() && setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(tick))

  let scroller: HTMLDivElement | undefined
  // A new turn (or a conversation just opened) starts at its request, so it is read from the top.
  createEffect((prev: number | undefined) => {
    const n = s().turns.length
    if (n && n !== prev && scroller) queueMicrotask(() => scroller?.querySelector('.turn:last-child')?.scrollIntoView({ block: 'start' }))
    return n
  })
  // The stretch card, when it appears, is brought into view: it waits for the person.
  createEffect((prev: string | undefined) => {
    const id = s().suggestion?.id
    if (id && id !== prev && scroller) queueMicrotask(() => scroller?.querySelector('.stretch-card')?.scrollIntoView({ block: 'nearest' }))
    return id
  })
  // While a run works, keep its newest step in view, unless the person scrolled up to read.
  createEffect(() => {
    const t = s().turns[s().turns.length - 1]
    void t?.steps.length
    void t?.answer
    if (!scroller || !working()) return
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160
    if (nearBottom) queueMicrotask(() => scroller && (scroller.scrollTop = scroller.scrollHeight))
  })
  // Files a run made with a program (a chart from Python, an Excel file) are not in its steps: when
  // a run ends, the files Ola made since it started are asked for once and listed under its reply,
  // with Open, beside the ones its own steps wrote (first-user pass: the chart and the .xlsx of a
  // spreadsheet question had no Open under the reply).
  const [madeByRun, setMadeByRun] = createSignal<{ turn: string; paths: string[] } | null>(null)
  // When a run ends, what it made (Open, the pictures) appears under the reply: brought into view,
  // unless the person scrolled up to read. Before, the Open button sat hidden under the composer.
  const toEnd = () => {
    if (!scroller) return
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 240
    if (nearBottom) setTimeout(() => scroller && (scroller.scrollTop = scroller.scrollHeight), 60)
  }
  // What the folder held when the run started: a file is the run's when it is new or changed since.
  // Comparing times instead missed files when the project's clock ran behind the browser's (second
  // first-user pass: a chart and an Excel file made by Python, nothing listed under the reply).
  let before: Promise<Map<string, string> | null> = Promise.resolve(null)
  createEffect((prev: string | undefined) => {
    const t = s().turns[s().turns.length - 1]
    const status = t?.status
    if (t && (status === 'sending' || status === 'working') && prev !== 'sending' && prev !== 'working')
      before = desk.files().then((fs) => new Map(fs.map((f) => [f.path, f.modified]))).catch(() => null)
    if (t && prev && (prev === 'working' || prev === 'sending') && status && status !== prev) {
      toEnd()
      const since = t.at - 2000
      Promise.all([before, desk.files()])
        .then(([had, fs]) => {
          const mine = (f: { path: string; modified: string }) => (had ? had.get(f.path) !== f.modified : Date.parse(f.modified) >= since)
          const paths = fs.filter((f) => f.origin === 'made' && mine(f) && canOpen(f.path) && plainPath(f.path)).map((f) => f.path)
          setMadeByRun({ turn: t.id, paths })
          if (paths.length) toEnd()
        })
        .catch(() => {})
    }
    return status
  })

  // "Compare with Claude" (Compare.tsx): the owner's only. The conversation's comparisons, asked
  // again while one is under way and whenever a run finishes.
  const [cmp, { refetch: refetchCompare }] = createResource(
    () => (props.open ? `${s().sessionID ?? ''}|${working() ? 'w' : 'i'}|${s().turns.length}` : null),
    (k) => compare.info(k.split('|')[0] || null).catch((): CompareInfo | null => null),
  )
  const pending = () => Object.values(cmp()?.results ?? {}).some((r) => ['making', 'running'].includes(r.state))
  const poll = setInterval(() => props.open && pending() && void refetchCompare(), 4000)
  onCleanup(() => clearInterval(poll))
  const [sheet, setSheet] = createSignal<{ message: string | null; id: string | null } | null>(null)

  // "Ask … instead" under a finished Ola reply: one for each fallback that is switched on.
  const insteadOf = (): Fallback[] => (['hosted', 'claude'] as Fallback[]).filter((f) => (f === 'claude' ? s().claude?.enabled : s().hosted?.enabled))

  // What was typed goes through ola.typed: a request, or a slash command (lib/commands.ts).
  const run = (text: string) => {
    // While Ola waits on a question, what is typed below is the answer (in the person's own words).
    const q = s().question
    if (q && q.fields.length === 1 && q.fields[0].custom && !text.trim().startsWith('/')) {
      void props.ola.answerQuestion({ [q.fields[0].key]: q.fields[0].multiple ? [text.trim()] : text.trim() }).then((ok) => ok && props.setDraft(''))
      return
    }
    const r = props.ola.typed(text)
    if (!r.keep) props.setDraft('')
    if (r.files) props.onFiles()
  }
  const submit = (e: Event) => {
    e.preventDefault()
    if (props.draft.trim()) run(props.draft)
  }

  // The command menu: "/" at the very start shows the commands that match what is typed so far,
  // each with its line; arrow keys and Return, or a click or tap. A word that matches none says
  // "No such command" at once. Escape puts the menu away until the text changes.
  let input: HTMLTextAreaElement | undefined
  const typedWord = () => props.draft.trim()
  const matches = () => commandMatches(typedWord())
  const [active, setActive] = createSignal(0)
  const [dismissed, setDismissed] = createSignal(false)
  createEffect((prev: string | undefined) => {
    const d = props.draft
    if (d !== prev) {
      setActive(0)
      setDismissed(false)
      if (prev !== undefined) props.ola.clearSaid()
    }
    return d
  })
  const unknownWord = () => typedWord().startsWith('/') && !/\s/.test(typedWord()) && typedWord().length > 1 && !matches().length
  const menuOpen = () => !dismissed() && (matches().length > 0 || unknownWord())
  const NEEDS_TEXT: CommandName[] = ['claude', 'ola', 'hosted']
  /** A command chosen in the menu: one that takes a request is written out for it; the others run. */
  const pick = (name: CommandName, fromKeys: boolean) => {
    const exact = parseCommand(typedWord())
    if (NEEDS_TEXT.includes(name) && !(fromKeys && exact.kind === 'command' && exact.name === name && typedWord() === `/${name}`)) {
      props.setDraft(`/${name} `)
      queueMicrotask(() => input?.focus())
      return
    }
    run(`/${name}`)
    queueMicrotask(() => input?.focus())
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.isComposing) return
    const list = matches()
    if (menuOpen() && list.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length)
        return
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault()
        pick(list[Math.min(active(), list.length - 1)], true)
        return
      }
    }
    if (menuOpen() && e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setDismissed(true)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) submit(e)
  }

  return (
    <aside id="ask-drawer" class="drawer" classList={{ open: props.open }} aria-label="Ask Ola" aria-hidden={!props.open} inert={!props.open ? true : undefined}>
      <header class="drawer-head">
        <span class="drawer-mark" classList={{ working: working() }} aria-hidden="true" />
        <h2 class="drawer-title">Ask Ola</h2>
        <span class="drawer-status">{working() ? 'working on your request' : s().turns.length ? '' : 'ready'}</span>
        <Show when={s().turns.length && !working()}>
          <button type="button" class="link-button on-paper" onClick={() => props.ola.newConversation()}>
            New conversation
          </button>
        </Show>
        <button type="button" class="ghost-button small drawer-close" onClick={props.onClose} aria-controls="ask-drawer" aria-label="Close the drawer">
          <Icon name="close" size={16} /> <span class="close-word">Close</span>
        </button>
      </header>

      <Show when={s().connection === 'lost'}>
        <div class="banner banner-lost" role="alert">
          <strong>Lost the connection to Ola’s computer.</strong> Trying again. Work already started keeps going there; this page catches up when the connection is back.
        </div>
      </Show>
      <Show when={s().problem}>{(p) => <ProblemBox problem={p()} role="alert" />}</Show>

      <div class="drawer-body" ref={scroller} tabindex="-1">
        <Show
          when={s().turns.length}
          fallback={
            <div class="drawer-empty">
              <p class="empty-lede">Ask for something to be made or changed. Ola works on its own computer, with the files you gave it, and tells you each step.</p>
              <p class="empty-label">For example</p>
              <ul class="starters">
                <For each={STARTERS}>
                  {(st) => (
                    <li>
                      <button type="button" class="starter" onClick={() => props.setDraft(st)}>
                        {st}
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          }
        >
          <ol class="turns">
            <For each={s().turns}>
              {(t, i) => (
                <TurnView
                  turn={t}
                  now={now()}
                  last={i() === s().turns.length - 1}
                  alsoMade={madeByRun()?.turn === t.id ? madeByRun()!.paths : []}
                  onStop={() => props.ola.stop()}
                  instead={working() || s().suggestion ? [] : insteadOf()}
                  onAsk={(f) => props.ola.askInstead(t.id, f)}
                  canCompare={!!cmp()?.canCompare && !working()}
                  compared={cmp()?.results?.[t.id] ?? null}
                  onCompare={() => setSheet({ message: t.id, id: null })}
                  onOpenCompare={(id) => setSheet({ message: t.id, id })}
                />
              )}
            </For>
          </ol>
        </Show>
        <Show when={s().question} keyed>
          {(q) => <QuestionCard question={q} onAnswer={(a) => props.ola.answerQuestion(a)} />}
        </Show>
        <Show when={s().suggestion}>
          <StretchCard ola={props.ola} />
        </Show>
        <CompareSheet open={!!sheet()} info={cmp() ?? null} conversation={s().sessionID ?? null} message={sheet()?.message ?? null} id={sheet()?.id ?? null} onClose={() => (setSheet(null), void refetchCompare())} onChanged={() => void refetchCompare()} />
        <Show when={s().help}>
          <section class="command-help" aria-label="Commands">
            <p class="command-help-title">Commands</p>
            <p class="command-help-lede">Type one at the start of a message. Only the request after it is sent.</p>
            <dl>
              <For each={COMMANDS}>
                {(c) => (
                  <div>
                    <dt>/{c.name}</dt>
                    <dd>{c.summary}</dd>
                  </div>
                )}
              </For>
            </dl>
          </section>
        </Show>
      </div>

      <form class="composer" onSubmit={submit}>
        <Show when={s().claude?.enabled || s().hosted?.enabled}>
          <fieldset class="autonomy engine">
            <legend class="engine-legend">Who works on this</legend>
            <label classList={{ on: s().engine === 'ola' }}>
              <input type="radio" name="engine" value="ola" checked={s().engine === 'ola'} onChange={() => props.ola.setEngine('ola')} />
              Ola
            </label>
            <Show when={s().hosted?.enabled}>
              <label classList={{ on: s().engine === 'hosted' }}>
                <input type="radio" name="engine" value="hosted" checked={s().engine === 'hosted'} onChange={() => props.ola.setEngine('hosted')} />
                Hosted open model
              </label>
            </Show>
            <Show when={s().claude?.enabled}>
              <label classList={{ on: s().engine === 'claude' }}>
                <input type="radio" name="engine" value="claude" checked={s().engine === 'claude'} onChange={() => props.ola.setEngine('claude')} />
                Claude
              </label>
            </Show>
            <span class="autonomy-hint">
              {s().engine === 'claude'
                ? 'Claude works in your project too, but your request and the parts of your files it reads go to Anthropic.'
                : s().engine === 'hosted'
                  ? `The hosted open model works in your project too, but your request, this conversation and the parts of your files it reads go to ${s().hosted?.provider ?? 'an outside company'}.`
                  : 'Ola works on this machine. Nothing you ask leaves it.'}
            </span>
          </fieldset>
        </Show>
        <div class="autonomy ask-first" classList={{ on: s().autonomy === 'ask' }}>
          {/* One switch, not two look-alike buttons (OLA-127: tapping the chosen one seemed to do nothing). */}
          <label class="ask-toggle" for="ask-switch">
            <input id="ask-switch" type="checkbox" role="switch" checked={s().autonomy === 'ask'} onChange={(e) => props.ola.setAutonomy(e.currentTarget.checked ? 'ask' : 'go')} />
            {/* Drawn like Settings' switches: the knob moves across, the pill turns blue, Off becomes On. */}
            <span class="switch" aria-hidden="true" aria-checked={s().autonomy === 'ask'}>
              <span class="switch-knob" />
              {s().autonomy === 'ask' ? 'On' : 'Off'}
            </span>
            <span class="ask-toggle-label">Ask before changes</span>
          </label>
          <span class="autonomy-hint">
            {s().engine === 'claude' && s().claude?.enabled
              ? s().autonomy === 'ask'
                ? 'Claude asks before it runs code or writes a file.'
                : 'Claude works inside this project without asking. It cannot reach the internet from here.'
              : s().engine === 'hosted' && s().hosted?.enabled
                ? s().autonomy === 'ask'
                  ? 'The hosted open model asks before it runs code or writes a file.'
                  : 'The hosted open model works inside this project without asking. It cannot reach the internet from here.'
                : s().autonomy === 'ask'
                ? 'Ola asks before it runs code or writes a file.'
                : 'Ola works inside this project without asking. A web search or download still asks you first.'}
          </span>
        </div>
        <Show when={s().said && !menuOpen()}>
          <p class="command-note" role="status">
            {s().said}
          </p>
        </Show>
        <div class="composer-row">
          <Show when={menuOpen()}>
            <div class="command-menu">
              <Show when={unknownWord()}>
                <p class="command-none" role="status">No such command</p>
              </Show>
              <Show when={matches().length}>
                <ul id="command-list" role="listbox" aria-label="Commands">
                  <For each={matches()}>
                    {(name, i) => (
                      <li
                        id={`command-${name}`}
                        role="option"
                        aria-selected={i() === active()}
                        classList={{ active: i() === active() }}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setActive(i())}
                        onClick={() => pick(name, false)}
                      >
                        <span class="command-name">/{name}</span>
                        <span class="command-summary">{COMMANDS.find((c) => c.name === name)!.summary}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </Show>
          <label for="ask-input" class="sr-only">
            Your request
          </label>
          <textarea
            id="ask-input"
            ref={(el) => {
              input = el
              props.inputRef?.(el)
            }}
            rows={2}
            aria-autocomplete="list"
            aria-expanded={menuOpen() && matches().length > 0}
            aria-controls={menuOpen() && matches().length ? 'command-list' : undefined}
            aria-activedescendant={menuOpen() && matches().length ? `command-${matches()[Math.min(active(), matches().length - 1)]}` : undefined}
            value={props.draft}
            placeholder={s().question ? 'Or write your answer here…' : working() ? 'Work is under way. You can write your next request.' : s().engine === 'claude' && s().claude?.enabled ? 'Ask Claude to make or change something…' : s().engine === 'hosted' && s().hosted?.enabled ? 'Ask the hosted open model to make or change something…' : 'Make something new, or change one of your things…'}
            onInput={(e) => props.setDraft(e.currentTarget.value)}
            onKeyDown={onKey}
          />
          <Show
            when={working()}
            fallback={
              <button type="submit" class="send-button" disabled={!props.draft.trim() || s().connection === 'lost'} aria-label={s().engine === 'claude' && s().claude?.enabled ? 'Send to Claude' : s().engine === 'hosted' && s().hosted?.enabled ? 'Send to the hosted open model' : 'Send to Ola'}>
                <Icon name="up" />
              </button>
            }
          >
            <button type="button" class="ghost-button" onClick={() => props.ola.stop()}>
              <Icon name="stop" size={16} /> Stop
            </button>
          </Show>
        </div>
        <div class="composer-foot">
          <button type="button" class="link-button on-paper" onClick={props.onAddFiles}>
            <Icon name="plus" size={16} /> Add files
          </button>
          <Show when={s().earlier.length}>
            <details class="earlier">
              <summary>{s().earlier.length === 1 ? 'One earlier conversation' : `${s().earlier.length} earlier conversations`}</summary>
              <ul>
                <For each={s().earlier}>
                  {(c) => (
                    <li>
                      <button type="button" class="link-button on-paper" onClick={() => props.ola.open(c.id)}>
                        {c.title}
                      </button>{' '}
                      <span class="meta">{when(c.updated)}</span>
                    </li>
                  )}
                </For>
              </ul>
            </details>
          </Show>
        </div>
      </form>
    </aside>
  )
}

function TurnView(props: { turn: Turn; now: number; last: boolean; alsoMade: string[]; onStop: () => void; instead: Fallback[]; onAsk: (f: Fallback) => void; canCompare: boolean; compared: CompareResultLine | null; onCompare: () => void; onOpenCompare: (id: string) => void }) {
  const t = () => props.turn
  const byClaude = () => t().engine === 'claude'
  const byHosted = () => t().engine === 'hosted'
  const name = () => (byClaude() ? 'Claude' : byHosted() ? 'the hosted open model' : 'Ola')
  const running = () => t().status === 'working' || t().status === 'sending'
  // The newest run stays open when it finishes, so the person sees what was done; older ones fold.
  const [open, setOpen] = createSignal(props.last)
  createEffect(() => !props.last && setOpen(false))
  const showSteps = () => running() || open()
  const failedSteps = () => t().steps.filter((st) => st.status === 'failed')
  const current = () => t().steps.findIndex((st) => st.status === 'running' || st.status === 'preparing' || st.status === 'waiting')
  const runId = () => `run-${t().id}`
  // Pages this run wrote or changed: an Open right under the reply, whatever the reply says.
  const reaction = () => turnReaction(t())
  const only = () => reactionOnly(t())
  const shownNotes = () => t().notes.map((n) => shown(n, running())).filter(Boolean)
  const shownAnswer = () => shown(t().answer, running())
  // Every kind Open shows (a page, a picture, a PDF, a table, a document), not only pages.
  const madePages = () => [...new Set([...t().steps.filter((st) => (st.icon === 'write' || st.icon === 'change') && st.status === 'done' && canOpen(st.object) && plainPath(st.object.replace(/^\/work\//, ''))).map((st) => st.object.replace(/^\/work\//, '')), ...props.alsoMade])].slice(0, 8)
  const isPicture = (p: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(p)
  // Ola's own screenshots of a page it checked (shots/) come after the pictures that were asked for.
  const madePictures = () => madePages().filter(isPicture).sort((a, b) => Number(a.startsWith('shots/')) - Number(b.startsWith('shots/'))).slice(0, 3)
  const madeOthers = () => madePages().filter((p) => !madePictures().includes(p))
  return (
    <li class="turn" data-status={t().status}>
      <div class="said-you" classList={{ reacted: !!reaction() }}>
        <p class="who">
          You <span class="meta">{clock(t().at)}</span>
          <Show when={byClaude() || byHosted()}>
            <span class="engine-mark" classList={{ hosted: byHosted() }}>{byClaude() ? 'Claude' : 'Hosted open model'}</span>
          </Show>
        </p>
        <p class="request">{t().request}</p>
        {/* The agent's reaction to this message (lib/commands.ts): 👀 while it works, then the reply's own, or ✅. */}
        <Show when={reaction()} keyed>
          {(r) => (
            <span class="reaction" data-reaction={r} role="img" aria-label={`Reaction: ${REACTIONS[r].meaning}`}>
              {REACTIONS[r].emoji}
            </span>
          )}
        </Show>
      </div>
      <Show when={!only()}>
      <div class="said-ola" classList={{ 'said-claude': byClaude(), 'said-hosted': byHosted() }}>
        <Show
          when={byClaude() || byHosted()}
          fallback={
            <p class="who">
              <span class="ola-dot" aria-hidden="true" /> Ola
            </p>
          }
        >
          <p class="who">
            <span class={byClaude() ? 'claude-dot' : 'hosted-dot'} aria-hidden="true" />
            <span>
              {byClaude() ? 'Claude' : 'Hosted open model'}
              <span class="outside">, outside this machine</span>
            </span>
          </p>
          <Show when={t().handoff}>
            <p class="handoff">{t().handoff}</p>
          </Show>
        </Show>
        <Show when={t().steps.length || running()}>
          <div class="run" classList={{ running: running() }}>
            <div class="run-head">
              <Show
                when={running()}
                fallback={
                  <button type="button" class="run-toggle" aria-expanded={open()} aria-controls={runId()} onClick={() => setOpen(!open())}>
                    <span class="chev" classList={{ open: open() }} aria-hidden="true">
                      <Icon name="back" size={16} />
                    </span>
                    {runSummary(t(), props.now)}
                  </button>
                }
              >
                <span class="lamp-dot" aria-hidden="true" />
                <span class="run-status">
                  <strong>{t().status === 'sending' ? 'Sending' : 'Working'}</strong> <span class="meta">{runSummary(t(), props.now).replace(/^Working for /, '')}</span>
                </span>
                <button type="button" class="ghost-button small" onClick={props.onStop}>
                  <Icon name="stop" size={14} /> Stop
                </button>
              </Show>
            </div>
            <Show when={t().notice}>
              <p class="run-notice" role="status">
                {t().notice}
              </p>
            </Show>
            <Show when={showSteps()} fallback={<For each={failedSteps()}>{(st) => <StepRow step={st} current={false} />}</For>}>
              <ol class="steps" id={runId()}>
                <For each={t().steps}>{(st, i) => <StepRow step={st} current={i() === current()} />}</For>
              </ol>
            </Show>
          </div>
        </Show>
        {/* A job Ola wrote down waits for the person's yes under Jobs. Said here at once, because the
            model may keep the conversation going (checking, waiting) instead of saying so (first-user
            pass: five minutes of "Checked on the job" and "Waited" with no word of where to go). */}
        <Show when={t().steps.some((st) => st.verb === JOB_PROPOSED && st.status === 'done')}>
          <p class="job-waits" role="status">
            Ola wrote down a job. It runs only when you start it, under <a href="#/jobs">Jobs</a>: a trial on a few documents first, then the rest.
          </p>
        </Show>
        <For each={shownNotes()}>{(n) => <Answer text={n} class="note" />}</For>
        <Show when={shownAnswer()}>
          <Answer text={shownAnswer()} />
        </Show>
        {/* A drawing or picture the run made is shown itself, up to three (Bart: "if it makes a
            drawing, show it inline"). Only ever as an <img> from /api/thumb, which answers image
            requests only, under a sandbox CSP: an SVG's scripts never run and it loads nothing. */}
        <Show when={!running() && madePictures().length}>
          <div class="made-pictures">
            <For each={madePictures()}>
              {(pg) => (
                <a class="made-picture" href={desk.openUrl(pg)} target="_blank" rel="noopener noreferrer">
                  <img src={desk.thumbUrl(pg)} alt={`${pg}, a picture made in this request`} loading="lazy" />
                  <span class="made-picture-name">
                    {pg}
                    <span class="sr-only"> (opens full size in a new tab)</span>
                  </span>
                </a>
              )}
            </For>
          </div>
        </Show>
        <Show when={!running() && madeOthers().length}>
          <p class="made-pages">
            <For each={madeOthers()}>
              {(pg) => (
                <a class="open-page" href={desk.openUrl(pg)} target="_blank" rel="noopener noreferrer">
                  Open {pg}
                  <span class="sr-only"> in a new tab</span>
                </a>
              )}
            </For>
          </p>
        </Show>
        <Show when={t().status === 'stopped' && !t().error}>
          <p class="meta stopped-line">You stopped this. Files {name()} already wrote stay as they are.</p>
        </Show>
        <Show when={t().error}>{(p) => <ProblemBox problem={p()} />}</Show>
        <Show when={props.compared && !byClaude()}>
          <CompareLine result={props.compared!} onOpen={() => props.onOpenCompare(props.compared!.id)} />
        </Show>
        <Show when={props.canCompare && !props.compared && !byClaude() && !byHosted() && t().status === 'done' && /^[A-Za-z0-9_-]{1,80}$/.test(t().id)}>
          <p class="ask-claude compare-ask">
            <button type="button" class="link-button on-paper" onClick={props.onCompare}>
              Compare with Claude
            </button>
          </p>
        </Show>
        <Show when={props.instead.length && !byClaude() && !byHosted() && !running()}>
          <p class="ask-claude">
            <For each={props.instead}>
              {(f) => (
                <button type="button" class="link-button on-paper" onClick={() => props.onAsk(f)}>
                  {f === 'claude' ? 'Ask Claude instead' : 'Ask the hosted model instead'}
                </button>
              )}
            </For>
          </p>
        </Show>
      </div>
      </Show>
    </li>
  )
}

function StepRow(props: { step: Step; current: boolean }) {
  const s = () => props.step
  const [details, setDetails] = createSignal(false)
  const id = () => `step-${s().id}`
  return (
    <li class="step" data-status={s().status} classList={{ current: props.current }}>
      <span class="step-icon">
        <Show when={s().status === 'running' || s().status === 'preparing'} fallback={<Icon name={s().icon} size={18} />}>
          <span class="spinner" aria-hidden="true" />
        </Show>
      </span>
      <div class="step-main">
        <p class="step-words">
          {s().verb}
          <Show when={s().object}>
            {' '}
            <strong>{s().object}</strong>
          </Show>
          <Show when={s().status === 'waiting'}>
            <span class="waiting-tag"> waiting for your yes</span>
          </Show>
          <Show when={s().status === 'failed'}>
            <span class="sr-only"> (did not work)</span>
          </Show>
          <Show when={s().result}>
            <span class="step-result-inline"> · {s().result}</span>
          </Show>
        </p>
        <Show when={s().error}>
          <p class="step-error">{s().error}</p>
        </Show>
        <Show when={s().detail.input || s().detail.output}>
          <button type="button" class="link-button on-paper details-toggle" aria-expanded={details()} aria-controls={id()} onClick={() => setDetails(!details())}>
            {details() ? 'Hide details' : 'Show details'}
          </button>
          <Show when={details()}>
            <div class="step-details" id={id()}>
              <Show when={s().detail.input}>
                <p class="details-label">{s().tool === 'shell' ? 'The command' : 'What was asked for'}</p>
                <pre>{s().detail.input}</pre>
              </Show>
              <Show when={s().detail.output}>
                <p class="details-label">What came back</p>
                <pre>{clip(s().detail.output)}</pre>
              </Show>
            </div>
          </Show>
        </Show>
      </div>
      <Show when={s().result}>
        <span class="step-result" aria-hidden="true">{s().result}</span>
      </Show>
    </li>
  )
}

/** The first and last 40 lines of a long output. */
function clip(text: string): string {
  const lines = text.split('\n')
  if (lines.length <= 90) return text
  return [...lines.slice(0, 40), `… ${lines.length - 80} more lines …`, ...lines.slice(-40)].join('\n')
}

/** Ola asks the person something and waits: its choices as buttons, and room for their own words. */
function QuestionCard(props: { question: Question; onAnswer: (a: Record<string, string | string[]>) => Promise<boolean> }) {
  const [busy, setBusy] = createSignal(false)
  const [own, setOwn] = createSignal<Record<string, string>>({})
  const [picked, setPicked] = createSignal<Record<string, string[]>>({})
  const single = () => props.question.fields.length === 1 && !props.question.fields[0].multiple
  const send = async (a: Record<string, string | string[]>) => {
    setBusy(true)
    const ok = await props.onAnswer(a)
    if (!ok) setBusy(false)
  }
  const fromPicks = () => {
    const a: Record<string, string | string[]> = {}
    for (const f of props.question.fields) {
      const typed = (own()[f.key] ?? '').trim()
      const chosen = picked()[f.key] ?? []
      a[f.key] = f.multiple ? [...chosen, ...(typed ? [typed] : [])] : typed || chosen[0] || ''
    }
    return a
  }
  const complete = () => Object.values(fromPicks()).every((v) => (Array.isArray(v) ? v.length > 0 : v !== ''))
  return (
    <section class="question-card" role="group" aria-labelledby={`q-${props.question.id}`} aria-busy={busy()}>
      <p class="question-kicker" id={`q-${props.question.id}`}>
        <span class="mark-dot" aria-hidden="true" /> Ola is asking you, and waits for your answer
      </p>
      <For each={props.question.fields}>
        {(f) => (
          <div class="question-field">
            <p class="question-text">{f.text || f.title}</p>
            <Show when={f.options.length}>
              <ul class="question-options">
                <For each={f.options}>
                  {(o) => {
                    const on = () => (picked()[f.key] ?? []).includes(o.value)
                    return (
                      <li>
                        <button
                          type="button"
                          class="question-option"
                          classList={{ on: on() }}
                          aria-pressed={single() ? undefined : on()}
                          disabled={busy()}
                          onClick={() => {
                            if (single()) return void send({ [f.key]: o.value })
                            setPicked((p) => ({ ...p, [f.key]: f.multiple ? (on() ? (p[f.key] ?? []).filter((v) => v !== o.value) : [...(p[f.key] ?? []), o.value]) : [o.value] }))
                          }}
                        >
                          <span class="question-option-label">{o.label}</span>
                          <Show when={o.description}>
                            <span class="question-option-more">{o.description}</span>
                          </Show>
                        </button>
                      </li>
                    )
                  }}
                </For>
              </ul>
            </Show>
            <Show when={f.custom}>
              <form
                class="question-own"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (single()) {
                    const t = (own()[f.key] ?? '').trim()
                    if (t) void send({ [f.key]: t })
                  } else if (complete()) void send(fromPicks())
                }}
              >
                <label class="sr-only" for={`q-own-${f.key}`}>
                  Your own answer
                </label>
                <input id={`q-own-${f.key}`} type="text" autocomplete="off" placeholder={f.options.length ? 'Or say it in your own words' : 'Your answer'} disabled={busy()} value={own()[f.key] ?? ''} onInput={(e) => setOwn((o) => ({ ...o, [f.key]: e.currentTarget.value }))} />
                <Show when={single()}>
                  <button type="submit" class="ghost-button small on-paper" disabled={busy() || !(own()[f.key] ?? '').trim()}>
                    Answer
                  </button>
                </Show>
              </form>
            </Show>
          </div>
        )}
      </For>
      <Show when={!single()}>
        <div class="question-actions">
          <button type="button" class="primary-button" disabled={busy() || !complete()} onClick={() => void send(fromPicks())}>
            Send my answers
          </button>
        </div>
      </Show>
      <Show when={busy()}>
        <p class="meta" role="status">
          Sent. Ola carries on.
        </p>
      </Show>
    </section>
  )
}

export function ProblemBox(props: { problem: Problem; role?: 'alert' }) {
  const [open, setOpen] = createSignal(false)
  return (
    <div class="problem" role={props.role}>
      <p>{props.problem.text}</p>
      <Show when={props.problem.detail}>
        <button type="button" class="link-button on-paper details-toggle" aria-expanded={open()} onClick={() => setOpen(!open())}>
          {open() ? 'Hide details' : 'Show details'}
        </button>
        <Show when={open()}>
          <pre>{props.problem.detail}</pre>
        </Show>
      </Show>
    </div>
  )
}
