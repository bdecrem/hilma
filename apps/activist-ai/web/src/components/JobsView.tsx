// "Jobs": the same question asked of many documents (frontdesk/jobs.mjs, workspace/ola-batch).
// Ola writes a job down when a person asks for it in a conversation; here the person reads the
// proposal (the form, how many documents, how long, how much), runs a trial on a few documents,
// looks at those rows with their quotes, and only then starts the whole job. A job keeps going when
// the page is closed; this page shows how far it is, and pauses, resumes or cancels it.
import { createEffect, createResource, createSignal, For, onCleanup, Show } from 'solid-js'
import { desk, DeskError, jobs as api } from '../lib/api.ts'
import type { Job, JobOption, JobPage, JobState, Problem } from '../lib/types.ts'
import { cap, count, when } from '../lib/format.ts'
import { Icon } from './Icon.tsx'
import { ProblemBox } from './Drawer.tsx'

const num = (n: number) => n.toLocaleString('en-US')
const problemOf = (e: unknown, text: string): Problem => (e instanceof DeskError ? e.problem : { text, detail: String(e) })
const stateOf = (j: Job): JobState => j.approved?.state ?? j.state
const going = (s: JobState) => s === 'trial' || s === 'running'

export function duration(s: number | null | undefined): string {
  if (s === null || s === undefined) return 'some time'
  if (s < 90) return 'a minute or two'
  if (s < 3600) return `about ${count(Math.round(s / 60), 'minute')}`
  if (s < 48 * 3600) {
    const h = Math.round((s / 3600) * 2) / 2
    return `about ${h === 1 ? 'an hour' : `${h} hours`}`
  }
  return `about ${Math.round((s / 86400) * 2) / 2} days`
}
const tokens = (n: number | null | undefined) => (n === null || n === undefined ? 'an unknown number of' : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} million` : num(n))
/** A share of the project's week, in words a person reads: "About 3%", "Less than 1%". */
export const share = (x: number) => (x < 0.01 ? 'Less than 1%' : `About ${Math.round(x * 100)}%`)
const BUDGET_STEPS = [1.5, 2, 3]
/** The model's own unit, for someone who wants it: shut by default. */
function Details(props: { tokens: number | null | undefined; label?: string }) {
  return (
    <Show when={props.tokens != null}>
      <details class="job-details">
        <summary>Show details</summary>
        <p class="file-meta flush">
          {props.label ?? 'Model use'}: about {tokens(props.tokens)} tokens, the unit the model counts in.
        </p>
      </details>
    </Show>
  )
}
const dollars = (o: JobOption, e: { tokens_in: number | null; tokens_out: number | null } | null) =>
  o.prices && e?.tokens_in != null && e?.tokens_out != null ? (e.tokens_in * o.prices.in + e.tokens_out * o.prices.out) / 1e6 : null

const STATE_WORDS: Record<JobState, string> = {
  proposed: 'Waiting for your look',
  trial: 'Trial running',
  trial_done: 'Trial done: look at the rows',
  running: 'Running',
  paused: 'Paused',
  done: 'Done',
  cancelled: 'Cancelled',
}

export const CHECK_WORDS: Record<string, string> = {
  found: 'Quote found',
  'found on another page': 'Quote found on another page',
  'quote not found': 'Quote not found: not checked',
  'not stated': 'Not stated in the document',
  'no text': 'No text in this document',
  'unusable answer': 'Answer could not be used',
  'no answer': 'No answer',
}

export function JobsView(props: { jobId: string | null }) {
  return (
    <section class="files-sheet jobs-sheet" aria-labelledby="jobs-title">
      <div class="files-inner">
        <Show when={props.jobId} fallback={<JobList />}>
          {(id) => <JobDetail id={id()} />}
        </Show>
      </div>
    </section>
  )
}

/** Refetch every few seconds while something is going; stop when the view goes away. */
function poll(refetch: () => void, active: () => boolean) {
  const t = setInterval(() => active() && refetch(), 3000)
  onCleanup(() => clearInterval(t))
}

function JobList() {
  const [list, { refetch }] = createResource(() => api.list())
  poll(() => void refetch(), () => (list()?.jobs ?? []).some((j) => going(stateOf(j))))
  return (
    <>
      <div class="files-top">
        <div>
          <h1 id="jobs-title" class="files-title" tabindex="-1">
            Jobs
          </h1>
          <p class="files-lede">A job asks the same question of many documents, one at a time, and writes one row per document, each answer with the passage it came from. It keeps going when you close this page.</p>
        </div>
      </div>
      <Show when={list.error}>
        <div class="data-problem">
          <ProblemBox problem={problemOf(list.error, 'The jobs could not be loaded.')} role="alert" />
          <button type="button" class="link-button on-paper" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </Show>
      <Show when={list()}>
        <Show
          when={list()!.jobs.length}
          fallback={<p class="meta empty-files jobs-empty">No jobs yet. Ask Ola something like “For each of these studies, tell me who makes the decision, with a quote”. It writes the job down here, and nothing runs until you say so.</p>}
        >
          <ul class="job-list" aria-label="Jobs">
            <For each={list()!.jobs}>{(j) => <JobCard job={j} />}</For>
          </ul>
        </Show>
      </Show>
    </>
  )
}

function Progress(props: { job: Job }) {
  const p = () => props.job.progress
  const trial = () => stateOf(props.job) === 'trial'
  const total = () => (trial() ? p().trial_total : p().total)
  const finished = () => (trial() ? p().trial_total - p().trial_left : p().done + p().failed + p().no_text)
  const pct = () => (total() ? Math.round((finished() / total()) * 100) : 0)
  return (
    <div class="job-progress">
      <div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={total()} aria-valuenow={finished()} aria-label={`${finished()} of ${total()} documents`}>
        <span class="bar-fill" style={{ width: `${pct()}%` }} />
      </div>
      <p class="job-counts">
        <strong>
          {num(finished())} of {num(total())}
        </strong>{' '}
        {trial() ? 'trial documents' : 'documents'}
        <Show when={p().failed}> · {num(p().failed)} failed</Show>
        <Show when={p().problems}> · {count(p().problems, 'row')} with a quote not found</Show>
        <Show when={going(stateOf(props.job)) && props.job.secondsLeft !== null && finished() < total()}> · {duration(props.job.secondsLeft)} left</Show>
      </p>
    </div>
  )
}

function JobCard(props: { job: Job }) {
  const s = () => stateOf(props.job)
  return (
    <li class="job-card" data-state={s()}>
      <div class="job-card-head">
        <a class="table-name" href={`#/jobs/${props.job.id}`}>
          <Icon name="table" size={18} />
          <span>{props.job.title}</span>
        </a>
        <span class="job-state" data-state={s()}>
          {STATE_WORDS[s()]}
        </span>
      </div>
      <Show when={s() !== 'proposed'} fallback={<p class="file-meta flush">{count(props.job.progress.total, 'document')} · proposed {props.job.created ? when(props.job.created) : ''}</p>}>
        <Progress job={props.job} />
      </Show>
      <Show when={props.job.waiting || (props.job.note && s() !== 'done')}>
        <p class="job-note">{props.job.waiting ?? props.job.note}</p>
      </Show>
    </li>
  )
}

function JobDetail(props: { id: string }) {
  const [stage, setStage] = createSignal<'trial' | 'full' | undefined>(undefined)
  const [offset, setOffset] = createSignal(0)
  const [problems, setProblems] = createSignal(false)
  const [page, { refetch }] = createResource(
    () => ({ id: props.id, stage: stage(), offset: offset(), problems: problems() }),
    (k) => api.one(k.id, { stage: k.stage, offset: k.offset, problems: k.problems }),
  )
  const [shown, setShown] = createSignal<JobPage | null>(null)
  createEffect(() => {
    const p = page()
    if (p) setShown(p)
  })
  poll(() => void refetch(), () => Boolean(shown() && going(stateOf(shown()!.job))))
  const [busy, setBusy] = createSignal(false)
  const [problem, setProblem] = createSignal<Problem | null>(null)
  const act = async (action: 'trial' | 'start' | 'pause' | 'resume' | 'cancel', body: Record<string, unknown> = {}) => {
    setBusy(true)
    setProblem(null)
    try {
      await api.act(action, { job: props.id, ...body })
      await refetch()
    } catch (e) {
      setProblem(problemOf(e, 'That did not work.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <a class="link-button on-paper" href="#/jobs">
        <Icon name="back" size={16} /> All jobs
      </a>
      <Show when={page.error && !shown()}>
        <div class="data-problem">
          <ProblemBox problem={problemOf(page.error, 'This job could not be loaded.')} role="alert" />
        </div>
      </Show>
      <Show when={shown()}>
        {(pg) => {
          const j = () => pg().job
          const s = () => stateOf(j())
          const owner = () => pg().role === 'owner'
          const canRun = () => pg().role === 'owner' || pg().role === 'member'
          return (
            <>
              <div class="job-head">
                <div>
                  <h1 id="jobs-title" class="files-title job-title" tabindex="-1">
                    {j().title}
                  </h1>
                  <p class="table-sub">
                    <span class="job-state" data-state={s()}>
                      {STATE_WORDS[s()]}
                    </span>{' '}
                    {count(j().progress.total, 'document')} · the answers go to the table <strong>{j().name}</strong>
                  </p>
                </div>
              </div>
              <Show when={j().waiting || (j().note && s() !== 'done')}>
                <p class="job-note" role="status">
                  {j().waiting ?? j().note}
                </p>
              </Show>
              <Show when={problem()}>{(p) => <ProblemBox problem={p()} role="alert" />}</Show>

              <Show when={s() === 'proposed'}>
                <Proposal job={j()} options={pg().options} canRun={canRun()} owner={owner()} busy={busy()} onTrial={(model, consent) => act('trial', { model, consent })} />
              </Show>
              <Show when={s() !== 'proposed'}>
                <Progress job={j()} />
                <div class="job-actions">
                  <Show when={going(s()) && canRun()}>
                    <button type="button" class="ghost-button on-paper" disabled={busy()} onClick={() => void act('pause')}>
                      <Icon name="stop" size={16} /> Pause
                    </button>
                  </Show>
                  <Show when={s() === 'paused' && canRun()}>
                    <button type="button" class="primary-button" disabled={busy()} onClick={() => void act('resume')}>
                      <Icon name="run" size={16} /> Resume
                    </button>
                  </Show>
                  <Show when={j().name && j().progress.done + j().progress.no_text > 0}>
                    <a class="ghost-button on-paper small" href={desk.excelUrl(j().name!)} download={`${j().name}.xlsx`}>
                      <Icon name="down" size={16} /> Download as Excel
                    </a>
                    <a class="link-button on-paper" href="#/data">
                      See it in Data
                    </a>
                  </Show>
                  <Show when={['trial', 'trial_done', 'running', 'paused'].includes(s()) && canRun()}>
                    <button
                      type="button"
                      class="link-button danger job-cancel"
                      disabled={busy()}
                      onClick={() => confirm('Cancel this job? What it has done so far stays in the table. It cannot be started again.') && void act('cancel')}
                    >
                      Cancel the job
                    </button>
                  </Show>
                </div>
              </Show>


              <Show when={s() !== 'proposed'}>
                <Results page={pg()} stage={stage()} setStage={(x) => (setStage(x), setOffset(0))} problems={problems()} setProblems={(x) => (setProblems(x), setOffset(0))} offset={offset()} setOffset={setOffset} loading={page.loading} />
              </Show>
              <Show when={s() === 'trial_done'}>
                <StartFull job={j()} options={pg().options} owner={owner()} busy={busy()} onStart={(budget, model, consent) => act('start', { budget, model, consent, confirm: true })} />
              </Show>
            </>
          )
        }}
      </Show>
    </>
  )
}

function FormTable(props: { job: Job }) {
  return (
    <table class="files job-form">
      <thead>
        <tr>
          <th scope="col">For each document</th>
          <th scope="col">Answers it may give</th>
        </tr>
      </thead>
      <tbody>
        <For each={props.job.fields}>
          {(f) => (
            <tr>
              <td>
                <strong>{f.question}</strong>
                <span class="file-meta flush">{f.name}</span>
              </td>
              <td>
                {f.type === 'category' ? `${(f.values ?? []).join(', ')}, or not stated` : f.type === 'number' ? 'A number, or not stated' : f.type === 'yesno' ? 'Yes, no, or not stated' : 'A short answer, or not stated'}
              </td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  )
}

function ModelChoice(props: { options: JobOption[]; owner: boolean; model: string; setModel: (m: string) => void; consent: boolean; setConsent: (b: boolean) => void; estimate: Job['estimate'] }) {
  const chosen = () => props.options.find((o) => o.model === props.model)
  return (
    <Show when={props.options.length > 1}>
      <fieldset class="job-models">
        <legend>Which model reads the documents</legend>
        <For each={props.options}>
          {(o) => {
            const usd = () => dollars(o, props.estimate)
            return (
              <label class="job-model" classList={{ off: !o.allowed }}>
                <input type="radio" name="job-model" value={o.model} checked={props.model === o.model} disabled={!o.allowed} onChange={() => props.setModel(o.model)} />
                <span>
                  <strong>{o.label}</strong>
                  <span class="file-meta flush">
                    {o.outside ? `Stronger. The documents’ text leaves this machine for ${o.provider}.${usd() !== null ? ` About $${usd()!.toFixed(2)} for this job.` : ''}${o.allowed ? '' : ' Only the project’s owner can choose it.'}` : 'Nothing leaves this machine. No cost per document.'}
                  </span>
                </span>
              </label>
            )
          }}
        </For>
        <Show when={chosen()?.outside}>
          <label class="job-consent">
            <input type="checkbox" checked={props.consent} onChange={(e) => props.setConsent(e.currentTarget.checked)} />
            <span>I agree that the text of these documents goes to {chosen()!.provider} for this job.</span>
          </label>
        </Show>
      </fieldset>
    </Show>
  )
}

function Proposal(props: { job: Job; options: JobOption[]; canRun: boolean; owner: boolean; busy: boolean; onTrial: (model: string, consent: boolean) => void }) {
  const [model, setModel] = createSignal<string>(props.job.model)
  const [consent, setConsent] = createSignal(false)
  const e = () => props.job.estimate
  const outside = () => props.options.find((o) => o.model === model())?.outside ?? false
  return (
    <section class="job-proposal" aria-labelledby="proposal-title">
      <h2 id="proposal-title" class="file-group-title">
        What Ola will ask of each document
      </h2>
      <Show when={props.job.instructions}>
        <p class="job-instructions">{props.job.instructions}</p>
      </Show>
      <FormTable job={props.job} />
      <p class="job-rule">Every answer comes with the passage it was read from and its page, and a program checks that each passage really is in the document. An answer whose passage is not found is marked, never shown as checked.</p>
      <dl class="job-facts">
        <div>
          <dt>Documents</dt>
          <dd>{num(e()?.documents ?? props.job.progress.total)}</dd>
        </div>
        <div>
          <dt>Time on this machine</dt>
          <dd>{cap(duration(e()?.seconds))}</dd>
        </div>
        <Show when={e()?.weekShare != null}>
          <div>
            <dt>Of a week of this project’s use</dt>
            <dd>{share(e()!.weekShare!)}</dd>
          </div>
        </Show>
      </dl>
      <Details tokens={e()?.tokens} />
      <p class="file-meta flush">These are estimates. A job runs on a budget of its own, so your conversations with Ola keep their full share while it runs. The trial measures the real numbers.</p>
      <ModelChoice options={props.options} owner={props.owner} model={model()} setModel={setModel} consent={consent()} setConsent={setConsent} estimate={e()} />
      <div class="job-go">
        <Show when={props.canRun} fallback={<p class="meta">You can read this job. The project’s owner or a member can run its trial.</p>}>
          <button type="button" class="primary-button" disabled={props.busy || (outside() && !consent())} onClick={() => props.onTrial(model(), consent())}>
            <Icon name="run" size={18} /> Run a trial on {count(props.job.trialSize ?? 15, 'document')}
          </button>
          <p class="upload-line">The trial picks {props.job.trialSize ?? 15} documents at random. You see their rows before anything else runs.</p>
        </Show>
      </div>
    </section>
  )
}

function StartFull(props: { job: Job; options: JobOption[]; owner: boolean; busy: boolean; onStart: (budget: number, model: string, consent: boolean) => void }) {
  const r = () => props.job.remainingEstimate ?? props.job.estimate
  // A person sets the budget as a multiple of the estimate, read as a share of the week and, for an
  // outside model, dollars. The job's contract with the gateway stays a number of tokens (under Show details).
  const [times, setTimes] = createSignal<number>(1.5)
  const [ok, setOk] = createSignal(false)
  const [model, setModel] = createSignal<string>(props.job.model)
  const [consent, setConsent] = createSignal(false)
  const outside = () => props.options.find((o) => o.model === model())?.outside ?? false
  const budget = () => (r()?.tokens ? Math.max(1000, Math.round((r()!.tokens! * times()) / 1000) * 1000) : (r()?.budget ?? 1_000_000))
  const budgetWords = (x: number) => {
    const e = r()
    const o = props.options.find((o) => o.model === model())
    const usd = o && e ? dollars(o, e) : null
    const parts = [e?.weekShare != null ? `up to ${share(e.weekShare * x).toLowerCase()} of a week of this project’s use` : `up to ${x === 1.5 ? 'one and a half times' : x === 2 ? 'twice' : 'three times'} the estimate`]
    if (o?.outside && usd !== null) parts.push(`at most about $${(usd * x).toFixed(2)}`)
    return cap(parts.join(', ')) + '.'
  }
  return (
    <section class="job-proposal job-start" aria-labelledby="start-title">
      <h2 id="start-title" class="file-group-title">
        The whole job
      </h2>
      <p class="job-instructions">
        The trial is done: look at its rows above. If they look right, the other {num(props.job.progress.pending)} documents take {duration(r()?.seconds)} on this machine
        {r()?.basis === 'measured in the trial' ? ', going by the trial' : ''}
        {r()?.weekShare != null ? `, ${share(r()!.weekShare!).toLowerCase()} of a week of this project’s use` : ''}. You can close this page; the job keeps going, and you can pause it at any time.
      </p>
      <Show when={props.owner} fallback={<p class="meta">Only the project’s owner can start the whole job, because it sets how much of this machine the job may use. Show them the trial’s rows.</p>}>
        <ModelChoice options={props.options} owner={props.owner} model={model()} setModel={setModel} consent={consent()} setConsent={setConsent} estimate={r()} />
        <fieldset class="job-models job-budget">
          <legend>How far it may go before it stops and asks you</legend>
          <For each={BUDGET_STEPS}>
            {(x) => (
              <label class="job-model">
                <input type="radio" name="job-budget" value={String(x)} checked={times() === x} onChange={() => setTimes(x)} />
                <span>
                  <strong>{x === 1.5 ? 'A little over the estimate' : x === 2 ? 'Twice the estimate' : 'Three times the estimate'}</strong>
                  <span class="file-meta flush">{budgetWords(x)}</span>
                </span>
              </label>
            )}
          </For>
        </fieldset>
        <label class="job-consent">
          <input type="checkbox" checked={ok()} onChange={(e) => setOk(e.currentTarget.checked)} />
          <span>I approve this budget: {budgetWords(times()).replace(/\.$/, '').replace(/^U/, 'u')}. The job pauses if it reaches it, and asks again.</span>
        </label>
        <Details tokens={budget()} label="The budget" />
        <div class="job-go">
          <button type="button" class="primary-button" disabled={props.busy || !ok() || !(budget() >= 1000) || (outside() && !consent())} onClick={() => props.onStart(budget(), model(), consent())}>
            <Icon name="run" size={18} /> Start the whole job
          </button>
        </div>
      </Show>
    </section>
  )
}

function Results(props: { page: JobPage; stage: 'trial' | 'full' | undefined; setStage: (s: 'trial' | 'full' | undefined) => void; problems: boolean; setProblems: (b: boolean) => void; offset: number; setOffset: (n: number) => void; loading: boolean }) {
  const res = () => props.page.results
  const job = () => props.page.job
  const rows = () => res().rows.map((r) => Object.fromEntries(res().columns.map((c, i) => [c, r[i]])))
  return (
    <section class="job-results" aria-labelledby="results-title">
      <h2 id="results-title" class="file-group-title">
        {stateOf(job()) === 'trial' || stateOf(job()) === 'trial_done' ? 'The trial’s rows' : 'The rows'}
      </h2>
      <div class="job-filters">
        <label>
          <input type="checkbox" checked={props.problems} onChange={(e) => props.setProblems(e.currentTarget.checked)} /> Only rows with a quote not found
        </label>
      </div>
      <p class="table-count" role="status" aria-live="polite">
        <Show when={res().total} fallback={props.problems ? 'No row has a quote that was not found.' : 'No rows yet.'}>
          Rows {num(res().offset + 1)} to {num(Math.min(res().offset + res().rows.length, res().total))} of {num(res().total)}
          {props.loading ? ' · loading…' : ''}
        </Show>
      </p>
      <Show when={res().rows.length}>
        <div class="grid-wrap" tabindex="0" aria-label="The rows; scrolls sideways">
          <table class="grid job-grid">
            <thead>
              <tr>
                <th scope="col">Document</th>
                <For each={job().fields}>{(f) => <th scope="col">{f.name}</th>}</For>
              </tr>
            </thead>
            <tbody>
              <For each={rows()}>
                {(r) => (
                  <tr>
                    <th scope="row" class="job-doc">
                      {String(r.document ?? '')}
                      <span class="file-meta flush">{r.checked === 'all quotes found' ? 'All quotes found' : String(r.checked ?? '')}</span>
                    </th>
                    <For each={job().fields}>
                      {(f) => {
                        const check = String(r[`${f.name}_check`] ?? '')
                        const bad = ['quote not found', 'unusable answer', 'no answer'].includes(check)
                        return (
                          <td class="job-cell" data-check={check}>
                            <span class="job-value">{r[f.name] === null || r[f.name] === undefined ? '—' : String(r[f.name])}</span>
                            <Show when={r[`${f.name}_quote`]}>
                              <q class="job-quote">{String(r[`${f.name}_quote`])}</q>
                            </Show>
                            <span class="job-check" classList={{ bad, good: check.startsWith('found') }}>
                              <Show when={check.startsWith('found')}>
                                <Icon name="check" size={14} />{' '}
                              </Show>
                              {CHECK_WORDS[check] ?? check}
                              {check.startsWith('found') && r[`${f.name}_page`] != null ? `, page ${r[`${f.name}_page`]}` : ''}
                            </span>
                          </td>
                        )
                      }}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <Show when={res().total > 50}>
        <div class="pager">
          <button type="button" class="ghost-button on-paper small" disabled={props.offset === 0} onClick={() => props.setOffset(Math.max(0, props.offset - 50))}>
            Previous 50
          </button>
          <button type="button" class="ghost-button on-paper small" disabled={props.offset + 50 >= res().total} onClick={() => props.setOffset(props.offset + 50)}>
            Next 50
          </button>
        </div>
        </Show>
      </Show>
      <p class="file-meta flush job-machine">Machine-coded by Ola: answers a model read from each document, not source data. Each row says which model and when.</p>
    </section>
  )
}
