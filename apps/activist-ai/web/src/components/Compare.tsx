// "Compare with Claude", the page's side (frontdesk/compare.mjs): owner only.
//
//   CompareLine     under a compared reply: "How did Ola do?" and one line, opening the side-by-side
//   CompareSheet    the flow: a made-up copy of this task (the default; nothing of the person's
//                   leaves this machine), shown before it goes; one that may still hold something
//                   of theirs is held until they read it and say yes; or the real task, only with
//                   the project's switch or "Just this once" after the consent text. Then both
//                   results side by side.
//   CompareSetting  in Settings: the real-task switch, and when made-up copies are made.
//   QualityView     the admin's Quality page (#/quality).
//
// Words a person reads: "Compare with Claude", "a made-up copy of this task", "Ola", "Claude",
// "this machine". Never our own words for the machinery.
import { createEffect, createResource, createSignal, For, onCleanup, Show } from 'solid-js'
import { compare, DeskError, qualityApi } from '../lib/api.ts'
import type { CompareCheck, CompareEngine, CompareInfo, CompareItem, CompareOutcome, CompareResultLine, Problem } from '../lib/types.ts'
import { bytes } from '../lib/format.ts'
import { Answer } from './Answer.tsx'
import { ProblemBox } from './Drawer.tsx'

export const OUTCOME_LINE: Record<CompareOutcome, string> = {
  both_right: 'Ola and Claude both got it right.',
  claude_better: 'Claude did better',
  ola_better: 'Ola did better',
  both_wrong: 'Neither got it fully right.',
  unsure: 'Too close to call.',
}
export const lineOf = (r: Pick<CompareResultLine, 'outcome' | 'sentence'>) =>
  r.outcome === 'claude_better' || r.outcome === 'ola_better' ? `${OUTCOME_LINE[r.outcome]}${r.sentence ? `: ${r.sentence.replace(/\.$/, '')}.` : '.'}` : OUTCOME_LINE[r.outcome!]

const WAITING: Partial<Record<CompareResultLine['state'], string>> = {
  making: 'Ola is making a made-up copy of this task…',
  ready: 'A made-up copy is ready for you to look at.',
  held: 'A made-up copy is waiting for you to read it.',
  running: 'Ola and Claude are each doing the task…',
  refused: 'The made-up copy held something of yours, so it stayed on this machine.',
  failed: 'The comparison did not finish. Nothing else was changed.',
}

export function CompareLine(props: { result: CompareResultLine; onOpen: () => void }) {
  const r = () => props.result
  return (
    <p class="compare-line" data-outcome={r().outcome ?? r().state}>
      <Show when={r().state === 'done' && r().outcome} fallback={<button type="button" class="link-button on-paper" onClick={props.onOpen}>{WAITING[r().state] ?? 'Compare with Claude'}</button>}>
        <span class="compare-q">How did Ola do?</span>{' '}
        <button type="button" class="link-button on-paper compare-a" onClick={props.onOpen}>
          {lineOf(r())}
        </button>
      </Show>
    </p>
  )
}

const FINDING: Record<string, string> = {
  name: 'a name from your files',
  number: 'a number from your files',
  numbers: 'numbers in the same order as in your files',
  phrase: 'words in a row from your files',
  file_name: 'a file name from your project',
  column: 'a column name from your files',
  word: 'a word from your files',
  year: 'a year from your files',
  encoded: 'something that looks like encoded text',
}

export function describeCheck(c: CompareCheck): string {
  const f = c.path ? c.path : 'the file'
  switch (c.type) {
    case 'file':
      return `A file named ${f}`
    case 'csv_rows':
      return `${f} has the right number of rows`
    case 'csv_columns':
      return `${f} has the columns asked for`
    case 'csv_unique':
      return `No repeats in the ${c.column ?? ''} column of ${f}`
    case 'csv_sum':
      return `The ${c.column ?? ''} column of ${f} adds up right`
    case 'says_number':
      return 'The answer gives the right number'
    case 'says':
      return `The answer says it: ${(c.any ?? []).slice(0, 3).join(', ')}`
    case 'says_none':
      return `The answer does not claim it: ${(c.any ?? []).slice(0, 3).join(', ')}`
    case 'quotes_verbatim':
      return 'Every quote is word for word'
    case 'inputs_unchanged':
      return 'The files it was given are left as they were'
    default:
      return c.name.replace(/_/g, ' ')
  }
}

function CopyView(props: { item: CompareItem }) {
  const t = () => props.item.twin!
  return (
    <div class="compare-copy">
      <p class="compare-label">The made-up request</p>
      <blockquote class="compare-request">{t().request}</blockquote>
      <p class="compare-label">Made-up files</p>
      <ul class="compare-files">
        <For each={t().files}>
          {(f) => (
            <li>
              <span class="compare-file-name">{f.name}</span> <span class="meta">{bytes(f.size)}</span>
              <Show when={f.text}>
                <pre class="compare-preview">{f.text!.split('\n').slice(0, 8).join('\n')}</pre>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <p class="compare-label">What a right result must have</p>
      <ul class="compare-checks">
        <For each={t().checks}>{(c) => <li>{describeCheck(c)}</li>}</For>
      </ul>
    </div>
  )
}

function Side(props: { who: string; e: CompareEngine; win: boolean }) {
  return (
    <section class="compare-side" classList={{ win: props.win }} aria-label={props.who}>
      <p class="who">
        <span class={props.who === 'Ola' ? 'ola-dot' : 'claude-dot'} aria-hidden="true" /> {props.who}
        <Show when={props.e.score}>
          <span class="meta"> {`${props.e.score!.passed} of ${props.e.score!.total} right`}</span>
        </Show>
      </p>
      <Show when={props.e.score}>
        <ul class="compare-scores">
          <For each={props.e.score!.checks}>{(c) => <li data-ok={c.ok ? 'yes' : 'no'}>{c.ok ? '✓' : '✗'} {c.name.replace(/_/g, ' ')}</li>}</For>
        </ul>
      </Show>
      <Answer text={props.e.final || '(No answer.)'} />
      <Show when={props.e.outputs.filter((o) => !o.input).length}>
        <p class="compare-label">Files made</p>
        <ul class="compare-files">
          <For each={props.e.outputs.filter((o) => !o.input)}>
            {(o) => (
              <li>
                <span class="compare-file-name">{o.name}</span> <span class="meta">{bytes(o.size)}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  )
}

export function SideBySide(props: { item: CompareItem }) {
  const r = () => props.item.result!
  return (
    <div class="compare-result">
      <p class="compare-verdict" data-outcome={r().outcome}>
        {lineOf({ outcome: r().outcome, sentence: r().judge.difference })}
      </p>
      <Show when={props.item.mode === 'twin'}>
        <p class="sheet-note">This was a made-up copy of your task. Nothing of yours left this machine.</p>
      </Show>
      <Show when={props.item.mode === 'real'}>
        <p class="sheet-note">This was your real task, sent to Claude with your yes. Your files were not changed.</p>
      </Show>
      <div class="compare-sides">
        <Side who="Ola" e={r().engines.ola} win={r().outcome === 'ola_better'} />
        <Side who="Claude" e={r().engines.claude} win={r().outcome === 'claude_better'} />
      </div>
    </div>
  )
}

/** The whole flow in one dialog. `start` is { conversation, message } for a new comparison, or an existing id. */
export function CompareSheet(props: { open: boolean; info: CompareInfo | null; conversation: string | null; message: string | null; id: string | null; onClose: () => void; onChanged: () => void }) {
  let dialog: HTMLDialogElement | undefined
  const [id, setId] = createSignal<string | null>(null)
  const [item, setItem] = createSignal<CompareItem | null>(null)
  const [busy, setBusy] = createSignal(false)
  const [problem, setProblem] = createSignal<Problem | null>(null)
  const [onceAsk, setOnceAsk] = createSignal(false)
  createEffect(() => {
    if (!dialog) return
    if (props.open && !dialog.open) (dialog.showModal(), setId(props.id), setItem(null), setProblem(null), setOnceAsk(false))
    else if (!props.open && dialog.open) dialog.close()
  })
  const load = async () => {
    const i = id()
    if (!i) return
    try {
      setItem(await compare.item(i))
    } catch (e) {
      if (e instanceof DeskError) setProblem(e.problem)
    }
  }
  createEffect(() => void (props.open && id() && load()))
  const timer = setInterval(() => {
    const s = item()?.state
    if (props.open && id() && (!s || s === 'making' || s === 'running' || (s === 'ready' && item()?.twin === null))) void load()
  }, 2500)
  onCleanup(() => clearInterval(timer))
  const act = async (f: () => Promise<{ id?: string } | unknown>) => {
    setBusy(true)
    setProblem(null)
    try {
      const r = (await f()) as { id?: string }
      if (r?.id) setId(r.id)
      await load()
      props.onChanged()
    } catch (e) {
      setProblem(e instanceof DeskError ? e.problem : { text: 'That did not reach Ola’s computer. Nothing was sent.', detail: String(e) })
      // Said where the person is looking: beside the button they pressed, brought into view (OLA-131).
      queueMicrotask(() => dialog?.querySelector('.problem')?.scrollIntoView({ block: 'nearest' }))
    } finally {
      setBusy(false)
    }
  }
  const startTwin = () => act(() => compare.start({ conversation: props.conversation!, message: props.message!, mode: 'twin' }))
  const startReal = (once: boolean) => act(() => compare.start({ conversation: props.conversation!, message: props.message!, mode: 'real', ...(once ? { once: true, consent: true } : {}) }))
  const it = () => item()
  return (
    <dialog ref={dialog} class="sheet compare-sheet" aria-labelledby="compare-title" onClose={() => props.open && props.onClose()}>
      <div class="sheet-inner">
        <h2 id="compare-title" class="sheet-title">
          Compare with Claude
        </h2>
        <Show when={id() ? problem() : null}>{(p) => <ProblemBox problem={p()} role="alert" />}</Show>
        {/* Not started yet: the choice. A refusal is said under the buttons, where the tap was. */}
        <Show when={!id()}>
          <Show
            when={props.info?.configured}
            fallback={
              <>
                <p class="sheet-lede">{props.info?.unavailable ?? 'Claude is not set up on this machine yet.'}</p>
                <div class="sheet-actions">
                  <button type="button" class="ghost-button on-paper" onClick={props.onClose}>
                    Close
                  </button>
                </div>
              </>
            }
          >
            <p class="sheet-lede">Ola makes a made-up copy of this task: the same kind of work, with invented names, numbers and words. Ola and Claude each do the copy, and you see who did better. Nothing of yours leaves this machine.</p>
            <div class="sheet-actions">
              <button type="button" class="primary-button" disabled={busy()} onClick={() => void startTwin()}>
                Make a made-up copy
              </button>
              <Show when={props.info?.real}>
                <button type="button" class="ghost-button on-paper" disabled={busy()} onClick={() => void startReal(false)}>
                  Send the real task
                </button>
              </Show>
              <Show when={!props.info?.real && !onceAsk()}>
                <button type="button" class="link-button on-paper" disabled={busy()} onClick={() => setOnceAsk(true)}>
                  Just this once: the real task
                </button>
              </Show>
            </div>
            <Show when={onceAsk()}>
              <div class="compare-once" role="group" aria-label="The real task, just this once">
                <p class="sheet-lede">{props.info?.consent}</p>
                <p class="sheet-note">This sends this one request only. The switch in Settings stays off.</p>
                <div class="sheet-actions">
                  <button type="button" class="primary-button" disabled={busy()} onClick={() => void startReal(true)}>
                    Send it this once
                  </button>
                  <button type="button" class="ghost-button on-paper" disabled={busy()} onClick={() => setOnceAsk(false)}>
                    Not now
                  </button>
                </div>
              </div>
            </Show>
            <Show when={problem()}>{(p) => <ProblemBox problem={p()} role="alert" />}</Show>
          </Show>
        </Show>

        <Show when={id() && it()}>
          <Show when={['making', 'running', 'failed', 'refused', 'declined'].includes(it()!.state)}>
            <p class="sheet-lede" role="status">
              {it()!.state === 'declined' ? 'Not sent. It stays on this machine.' : WAITING[it()!.state]}
            </p>
          </Show>
          <Show when={it()!.state === 'held' && it()!.twin}>
            <p class="sheet-lede">This made-up copy may still hold something of yours. Read it before it goes.</p>
            <ul class="compare-findings">
              <For each={it()!.findings ?? []}>
                {(f) => (
                  <li>
                    {FINDING[f.kind] ?? 'something from your files'}: <strong>{f.text}</strong> <span class="meta">({f.where.replace(/^file /, 'in ')})</span>
                  </li>
                )}
              </For>
            </ul>
            <CopyView item={it()!} />
            <div class="sheet-actions">
              <button type="button" class="primary-button" disabled={busy()} onClick={() => void act(() => compare.send(id()!, true))}>
                Send it anyway
              </button>
              <button type="button" class="ghost-button on-paper" disabled={busy()} onClick={() => void act(() => compare.discard(id()!))}>
                Don’t send
              </button>
            </div>
          </Show>
          <Show when={it()!.state === 'ready' && it()!.twin}>
            <p class="sheet-lede">Here is the made-up copy. Nothing of yours is in it. It goes to Claude only when you say so.</p>
            <CopyView item={it()!} />
            <div class="sheet-actions">
              <button type="button" class="primary-button" disabled={busy()} onClick={() => void act(() => compare.send(id()!))}>
                Send it to Claude
              </button>
              <button type="button" class="ghost-button on-paper" disabled={busy()} onClick={() => void act(() => compare.discard(id()!))}>
                Not now
              </button>
            </div>
          </Show>
          <Show when={it()!.state === 'done' && it()!.result}>
            <SideBySide item={it()!} />
            <Show when={it()!.twin}>
              <details class="compare-more">
                <summary>The made-up copy</summary>
                <CopyView item={it()!} />
              </details>
            </Show>
          </Show>
          <Show when={it()!.state !== 'ready' && it()!.state !== 'held'}>
            <div class="sheet-actions">
              <button type="button" class="ghost-button on-paper" onClick={props.onClose}>
                Close
              </button>
            </div>
          </Show>
        </Show>
      </div>
    </dialog>
  )
}

/** Settings: the real-task switch (owner only, its own consent) and when made-up copies are made. */
export function CompareSetting() {
  const [info, { mutate }] = createResource(() => compare.info().catch(() => null))
  const [asking, setAsking] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [problem, setProblem] = createSignal<Problem | null>(null)
  const act = async (body: Parameters<typeof compare.settings>[0]) => {
    setBusy(true)
    setProblem(null)
    try {
      mutate(await compare.settings(body))
    } catch (e) {
      setProblem(e instanceof DeskError ? e.problem : { text: 'The change did not reach Ola’s computer. Nothing was changed.', detail: String(e) })
    } finally {
      setBusy(false)
      setAsking(false)
    }
  }
  return (
    <Show when={info()?.canCompare}>
      <div class="setting compare-setting" aria-labelledby="compare-setting-title">
        <h2 class="setting-name" id="compare-setting-title">
          Compare with Claude
        </h2>
        <p class="setting-say">Under a finished reply, you can ask how Claude would have done the same work. By default Ola makes a made-up copy of the task, and nothing of yours leaves this machine.</p>
        <Show when={problem()}>{(p) => <ProblemBox problem={p()} role="alert" />}</Show>
        <Show when={!info()!.configured}>
          <p class="setting-note">{info()!.unavailable}</p>
        </Show>
        <div class="setting-block">
          <div class="setting-row">
            <div class="setting-text">
              <h3 class="setting-name small" id="compare-real">
                Compare the real task
              </h3>
              <p class="setting-say">{info()!.real ? 'On. Claude may redo finished work in this project, and every time is shown here.' : 'Off. Only made-up copies are compared.'}</p>
            </div>
            <button type="button" class="switch" role="switch" aria-checked={!!info()!.real} aria-labelledby="compare-real" disabled={busy() || (!info()!.real && !info()!.configured)} onClick={() => (info()!.real ? void act({ real: false }) : setAsking(true))}>
              <span class="switch-knob" aria-hidden="true" />
              <span class="switch-word">{info()!.real ? 'On' : 'Off'}</span>
            </button>
          </div>
          <Show when={info()!.realSent?.length}>
            <p class="compare-label">Real tasks sent to Claude</p>
            <ul class="compare-sent">
              <For each={info()!.realSent}>
                {(r) => (
                  <li>
                    {new Date(r.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}: {r.state === 'done' && r.outcome ? OUTCOME_LINE[r.outcome].replace(/\.$/, '') : r.state === 'failed' ? 'did not finish' : 'under way'}
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <Show when={asking()}>
            <div class="compare-once" role="group" aria-label="Turn on comparing the real task">
              <p class="sheet-lede">{info()!.consent}</p>
              <div class="sheet-actions">
                <button type="button" class="primary-button" disabled={busy()} onClick={() => void act({ real: true, consent: true })}>
                  Turn it on
                </button>
                <button type="button" class="ghost-button on-paper" disabled={busy()} onClick={() => setAsking(false)}>
                  Not now
                </button>
              </div>
            </div>
          </Show>
        </div>
        <fieldset class="compare-stops" disabled={busy()}>
          <legend class="setting-name small">When made-up copies are made</legend>
          <div class="stops two">
            <For each={[{ value: 'ask' as const, label: 'Only when I ask', hint: 'Under a finished reply, choose Compare with Claude.' }, { value: 'daily' as const, label: 'A few each day, on their own', hint: 'Ola picks finished requests at random, only while no one is working, within the month’s budget.' }]}>
              {(o) => (
                <label class="stop" classList={{ on: info()!.auto === o.value }}>
                  <input type="radio" name="compare-auto" value={o.value} checked={info()!.auto === o.value} onChange={() => void act({ auto: o.value })} />
                  <span class="stop-label">{o.label}</span>
                  <span class="stop-hint">{o.hint}</span>
                </label>
              )}
            </For>
          </div>
          <dl class="facts">
            <Show when={info()!.auto === 'daily'}>
              <div>
                <dt>
                  <label for="compare-per-day">At most a day</label>
                </dt>
                <dd>
                  <select id="compare-per-day" value={String(info()!.perDay)} onChange={(e) => void act({ perDay: Number(e.currentTarget.value) })}>
                    <For each={[1, 2, 3, 5, 10]}>{(n) => <option value={String(n)}>{n}</option>}</For>
                  </select>
                </dd>
              </div>
            </Show>
            <div>
              <dt>
                <label for="compare-cap">Budget a month</label>
              </dt>
              <dd>
                <select id="compare-cap" value={String(info()!.month!.capUsd)} onChange={(e) => void act({ capUsd: Number(e.currentTarget.value) })}>
                  <For each={[...new Set([0, 1, 3, 5, 10, 20, info()!.month!.capUsd])].sort((a, b) => a - b)}>{(n) => <option value={String(n)}>${n}</option>}</For>
                </select>{' '}
                <span class="meta">{`$${info()!.month!.usedUsd.toFixed(2)} used this month`}</span>
              </dd>
            </div>
          </dl>
        </fieldset>
      </div>
    </Show>
  )
}

/** The admin's Quality page: how Ola does against Claude, over time, by kind of work and by model. */
export function QualityView(props: { titleRef?: (el: HTMLHeadingElement) => void }) {
  const [q] = createResource(() => qualityApi.get())
  const pct = (a: number, all: number) => (all ? `${Math.round((a / all) * 100)}%` : '–')
  const sum = (w: { ola: number; tie: number; claude: number; unsure: number }) => w.ola + w.tie + w.claude + w.unsure
  const Bar = (p: { w: { ola: number; tie: number; claude: number; unsure: number } }) => (
    <span class="wtl-bar" role="img" aria-label={`Ola better ${p.w.ola}, tied ${p.w.tie}, Claude better ${p.w.claude}, too close ${p.w.unsure}`}>
      <span class="wtl-ola" style={{ flex: p.w.ola }} />
      <span class="wtl-tie" style={{ flex: p.w.tie }} />
      <span class="wtl-claude" style={{ flex: p.w.claude }} />
      <span class="wtl-unsure" style={{ flex: p.w.unsure }} />
    </span>
  )
  const Table = (p: { rows: ({ name: string } & { ola: number; tie: number; claude: number; unsure: number })[]; head: string }) => (
    <table class="quality-table">
      <thead>
        <tr>
          <th scope="col">{p.head}</th>
          <th scope="col">Ola better</th>
          <th scope="col">Tied</th>
          <th scope="col">Claude better</th>
          <th scope="col">Too close</th>
          <th scope="col" class="wide">
            <span class="sr-only">Share</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <For each={p.rows}>
          {(r) => (
            <tr>
              <th scope="row">{r.name}</th>
              <td>{r.ola}</td>
              <td>{r.tie}</td>
              <td>{r.claude}</td>
              <td>{r.unsure}</td>
              <td class="wide">
                <Bar w={r} />
              </td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
  return (
    <section class="files-sheet quality" aria-labelledby="quality-title">
      <div class="files-inner">
        <div class="files-top">
          <div>
            <h1 id="quality-title" class="files-title" ref={props.titleRef} tabindex="-1">
              Quality
            </h1>
            <p class="files-lede">How Ola does against Claude on made-up copies of real requests.</p>
          </div>
        </div>
        <Show when={q()} fallback={<p class="loading" role="status">{q.error ? 'Not known just now.' : 'Loading…'}</p>}>
          {(x) => (
            <>
              <dl class="quality-head">
                <div>
                  <dt>Compared</dt>
                  <dd>{sum(x().total)}</dd>
                </div>
                <div>
                  <dt>Ola matched or beat Claude</dt>
                  <dd>{pct(x().total.ola + x().total.tie, sum(x().total) - x().total.unsure)}</dd>
                </div>
                <div>
                  <dt>The last 7 days</dt>
                  <dd>{x().weekly.overall.share === null ? '–' : `${Math.round(x().weekly.overall.share! * 100)}%`}</dd>
                </div>
                <div>
                  <dt>Spent on Claude</dt>
                  <dd>{`$${(x().cost.month_micro_usd / 1e6).toFixed(2)} this month`}</dd>
                </div>
              </dl>
              <h2 class="setting-name">By kind of work</h2>
              <Table rows={x().byKind} head="Kind" />
              <h2 class="setting-name">By model</h2>
              <Table rows={x().byModel} head="Ola’s model" />
              <h2 class="setting-name">Over time</h2>
              <Table rows={x().overTime.map((d) => ({ ...d, name: d.day }))} head="Day" />
              <h2 class="setting-name">Why Ola lost</h2>
              <Show when={x().reasons.length} fallback={<p class="setting-say">Ola has not lost one yet.</p>}>
                <ul class="quality-reasons">
                  <For each={x().reasons}>
                    {(r) => (
                      <li>
                        <code>{r.label}</code> <span class="meta">{r.n}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <h2 class="setting-name">The comparisons</h2>
              <ol class="quality-list">
                <For each={x().list}>
                  {(c) => (
                    <li data-outcome={c.outcome ?? c.state}>
                      <p>
                        <span class="meta">{new Date(c.at).toISOString().slice(0, 16).replace('T', ' ')}</span> <strong>{c.project}</strong> <span class="meta">{c.kind ?? ''} · {c.mode === 'twin' ? 'made-up copy' : 'real task'}{c.trigger === 'sampled' ? ' · on its own' : ''}</span>
                      </p>
                      <p>{c.state === 'done' && c.outcome ? lineOf({ outcome: c.outcome, sentence: c.difference }) : c.state}</p>
                      <Show when={c.request}>
                        <p class="quality-request">{c.request}</p>
                      </Show>
                      <p class="meta">
                        {c.olaTotal ? `Ola ${c.olaPassed}/${c.olaTotal}, Claude ${c.claudePassed}/${c.claudeTotal}` : ''}
                        {c.label ? ` · ${c.label}` : ''}
                        {c.cost ? ` · $${(c.cost / 1e6).toFixed(3)}` : ''}
                      </p>
                    </li>
                  )}
                </For>
              </ol>
            </>
          )}
        </Show>
      </div>
    </section>
  )
}
