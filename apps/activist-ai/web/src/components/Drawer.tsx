// "Ask Ola": the conversation, in a drawer beside the things (a sheet on a phone).
// A request, then the run in plain-word steps (details on request), then the answer. Approvals,
// errors and a lost connection are said out loud, never swallowed.
import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import type { Ola } from '../lib/ola.ts'
import type { Problem, Step, Turn } from '../lib/types.ts'
import { runSummary } from '../lib/conversation.ts'
import { clock, when } from '../lib/format.ts'
import { Answer } from './Answer.tsx'
import { Icon } from './Icon.tsx'

const STARTERS = ['Clean survey.csv and give me the totals by city', 'How many people in survey.csv are satisfied?', 'Write a one-page summary of survey.csv']

export function Drawer(props: { ola: Ola; open: boolean; onClose: () => void; onAddFiles: () => void; draft: string; setDraft: (s: string) => void; inputRef?: (el: HTMLTextAreaElement) => void }) {
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
  // While a run works, keep its newest step in view, unless the person scrolled up to read.
  createEffect(() => {
    const t = s().turns[s().turns.length - 1]
    void t?.steps.length
    void t?.answer
    if (!scroller || !working()) return
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160
    if (nearBottom) queueMicrotask(() => scroller && (scroller.scrollTop = scroller.scrollHeight))
  })

  const submit = (e: Event) => {
    e.preventDefault()
    const text = props.draft.trim()
    if (!text || working() || s().connection === 'lost') return
    props.setDraft('')
    void props.ola.send(text)
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
            <For each={s().turns}>{(t, i) => <TurnView turn={t} now={now()} last={i() === s().turns.length - 1} onStop={() => props.ola.stop()} />}</For>
          </ol>
        </Show>
      </div>

      <form class="composer" onSubmit={submit}>
        <fieldset class="autonomy">
          <legend class="sr-only">How Ola works</legend>
          <label classList={{ on: s().autonomy === 'go' }}>
            <input type="radio" name="autonomy" value="go" checked={s().autonomy === 'go'} onChange={() => props.ola.setAutonomy('go')} />
            Go ahead
          </label>
          <label classList={{ on: s().autonomy === 'ask' }}>
            <input type="radio" name="autonomy" value="ask" checked={s().autonomy === 'ask'} onChange={() => props.ola.setAutonomy('ask')} />
            Ask me first
          </label>
          <span class="autonomy-hint">{s().autonomy === 'ask' ? 'Ola asks before it runs code or writes a file.' : 'Ola works inside this project without asking. Anything that would leave the machine is blocked.'}</span>
        </fieldset>
        <div class="composer-row">
          <label for="ask-input" class="sr-only">
            Your request
          </label>
          <textarea
            id="ask-input"
            ref={props.inputRef}
            rows={2}
            value={props.draft}
            placeholder={working() ? 'Ola is working. You can write your next request.' : 'Make something new, or change one of your things…'}
            onInput={(e) => props.setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) submit(e)
            }}
          />
          <Show
            when={working()}
            fallback={
              <button type="submit" class="send-button" disabled={!props.draft.trim() || s().connection === 'lost'} aria-label="Send to Ola">
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

function TurnView(props: { turn: Turn; now: number; last: boolean; onStop: () => void }) {
  const t = () => props.turn
  const running = () => t().status === 'working' || t().status === 'sending'
  // The newest run stays open when it finishes, so the person sees what was done; older ones fold.
  const [open, setOpen] = createSignal(props.last)
  createEffect(() => !props.last && setOpen(false))
  const showSteps = () => running() || open()
  const failedSteps = () => t().steps.filter((st) => st.status === 'failed')
  const current = () => t().steps.findIndex((st) => st.status === 'running' || st.status === 'preparing' || st.status === 'waiting')
  const runId = () => `run-${t().id}`
  return (
    <li class="turn" data-status={t().status}>
      <div class="said-you">
        <p class="who">
          You <span class="meta">{clock(t().at)}</span>
        </p>
        <p class="request">{t().request}</p>
      </div>
      <div class="said-ola">
        <p class="who">
          <span class="ola-dot" aria-hidden="true" /> Ola
        </p>
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
        <For each={t().notes}>{(n) => <Answer text={n} class="note" />}</For>
        <Show when={t().answer}>
          <Answer text={t().answer} />
        </Show>
        <Show when={t().status === 'stopped' && !t().error}>
          <p class="meta stopped-line">You stopped this. Files Ola already wrote stay as they are.</p>
        </Show>
        <Show when={t().error}>{(p) => <ProblemBox problem={p()} />}</Show>
      </div>
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
                <p class="details-label">{s().tool === 'shell' ? 'The command' : 'What Ola asked for'}</p>
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
