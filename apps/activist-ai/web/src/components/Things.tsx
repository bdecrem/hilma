// The project's things, each as paper on the desk: a header band (icon, title, who made it and
// when) and a body that shows the thing itself, never a thumbnail too small to read.
import { For, Match, Show, Switch } from 'solid-js'
import type { Byline, ChartThing, DashboardThing, DocumentThing, FileEntry, SiteThing, TableThing, Thing } from '../lib/types.ts'
import { bytes, count, when } from '../lib/format.ts'
import { desk } from '../lib/api.ts'
import { Icon } from './Icon.tsx'

function byline(b: Byline): string {
  const by = b.madeBy === 'bart' ? 'Built by Bart with you' : b.madeBy === 'you' ? 'Made by you with Ola' : b.madeBy === 'group' ? (b.who ?? 'Made together') : 'Ola'
  const parts = [by]
  if (b.madeBy !== 'bart') parts.push(when(b.when))
  if (b.from.length) parts.push(`from ${b.from.join(' and ')}`)
  return parts.join(' · ')
}

export function ThingCard(props: { thing: Thing }) {
  const t = () => props.thing
  const headingId = () => `thing-${t().id.replace(/[^a-z0-9]/gi, '-')}`
  return (
    <article class={`thing thing-${t().kind}`} classList={{ 'is-being-made': t().state === 'being-made' }} aria-labelledby={headingId()}>
      <header class="thing-head">
        <span class="thing-icon">
          <Icon name={t().kind} />
        </span>
        <div class="thing-titles">
          <h2 id={headingId()} class="thing-title">
            {t().title}
          </h2>
          <p class="thing-byline">
            <Show when={t().state === 'being-made'}>
              <span class="lamp-tag">Being made</span>{' '}
            </Show>
            <Show when={t().kind === 'dashboard' && (t() as DashboardThing).live} fallback={byline(t().byline)}>
              {byline(t().byline)} · <span class="live">live</span>, {(t() as DashboardThing).cadence}
            </Show>
          </p>
        </div>
        <Show when={t().file}>
          <div class="thing-actions">
            <Show when={t().openable}>
              <a class="thing-action thing-open" href={desk.openUrl(t().file!)} target="_blank" rel="noopener noreferrer">
                Open<span class="sr-only"> {t().title} in a new tab</span>
              </a>
            </Show>
            <a class="thing-action" href={desk.downloadUrl(t().file!)} download="">
              Download<span class="sr-only"> {t().title}</span>
            </a>
          </div>
        </Show>
      </header>
      <div class="thing-body">
        <Switch>
          <Match when={t().kind === 'dashboard'}>
            <Dashboard thing={t() as DashboardThing} />
          </Match>
          <Match when={t().kind === 'document'}>
            <DocumentPreview thing={t() as DocumentThing} />
          </Match>
          <Match when={t().kind === 'chart'}>
            <Chart thing={t() as ChartThing} />
          </Match>
          <Match when={t().kind === 'table'}>
            <Table thing={t() as TableThing} />
          </Match>
          <Match when={t().kind === 'site'}>
            <Site thing={t() as SiteThing} />
          </Match>
        </Switch>
      </div>
    </article>
  )
}

function Dashboard(props: { thing: DashboardThing }) {
  const d = () => props.thing
  const max = () => Math.max(...d().series.points.map((p) => p.value), 1)
  return (
    <div class="dash">
      <h3 class="dash-heading">{d().heading}</h3>
      <p class="dash-dek">{d().dek}</p>
      <dl class="dash-stats">
        <For each={d().stats}>
          {(s) => (
            <div class="dash-stat">
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          )}
        </For>
      </dl>
      <figure class="dash-series">
        <figcaption class="dash-label">{d().series.label}</figcaption>
        <div class="columns" role="img" aria-label={`${d().series.label}: ${d().series.points.map((p) => `${p.label}, ${p.value}`).join('; ')}`}>
          <For each={d().series.points}>
            {(p) => (
              <div class="column">
                <div class="column-bar" style={{ height: `${(p.value / max()) * 100}%` }} />
                <span class="column-label">{p.label}</span>
              </div>
            )}
          </For>
        </div>
        <Show when={d().series.note}>
          <p class="dash-note">{d().series.note}</p>
        </Show>
      </figure>
      <h4 class="dash-label">{d().breakdown.label}</h4>
      <table class="dash-rows">
        <tbody>
          <For each={d().breakdown.rows}>
            {(r) => (
              <tr>
                <th scope="row">{r.label}</th>
                <td>{r.value}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  )
}

function DocumentPreview(props: { thing: DocumentThing }) {
  const d = () => props.thing
  return (
    <div class="doc-sheet">
      <h3 class="doc-heading">{d().heading}</h3>
      <Show when={d().dek}>
        <p class="doc-dek">{d().dek}</p>
      </Show>
      <For each={d().sections}>
        {(s) => (
          <section class="doc-section">
            <Show when={s.heading}>
              <h4 class="doc-section-heading">
                {s.heading}
                <Show when={s.pending}>
                  {' '}
                  <span class="pending-tag">not written yet</span>
                </Show>
              </h4>
            </Show>
            <For each={s.paragraphs}>{(p) => <p>{p}</p>}</For>
          </section>
        )}
      </For>
    </div>
  )
}

function Chart(props: { thing: ChartThing }) {
  const c = () => props.thing
  return (
    <figure class="bars">
      <ul class="bars-list">
        <For each={c().bars}>
          {(b) => (
            <li class="bars-row">
              <span class="bars-label">{b.label}</span>
              <span class="bars-track">
                <span class="bars-fill" style={{ width: `${(b.value / c().of) * 100}%` }} />
                <span class="bars-value">{b.value}</span>
              </span>
            </li>
          )}
        </For>
      </ul>
      <figcaption class="bars-note">
        of {c().of} {c().unit}
      </figcaption>
    </figure>
  )
}

function Table(props: { thing: TableThing }) {
  const t = () => props.thing
  return (
    <div class="table-wrap" tabindex="0" role="region" aria-label={`${t().title}, table`}>
      <table class="data">
        <thead>
          <tr>
            <For each={t().columns}>{(c) => <th scope="col" classList={{ num: !!c.numeric }}>{c.label}</th>}</For>
          </tr>
        </thead>
        <tbody>
          <For each={t().rows}>
            {(row) => (
              <tr>
                <For each={row}>{(cell, i) => <td classList={{ num: !!t().columns[i()]?.numeric }}>{cell}</td>}</For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={t().note}>
        <p class="table-note">{t().note}</p>
      </Show>
    </div>
  )
}

function Site(props: { thing: SiteThing }) {
  const s = () => props.thing
  return (
    <div class="site">
      <p class="site-summary">{s().summary}</p>
      <p class="site-meta">
        {s().pages === 1 ? 'One page' : `${s().pages} pages`} · {s().visibility === 'private' ? 'Private: only the people in this project can open it. It is not on the public web.' : 'Public'}
      </p>
    </div>
  )
}

/** The rest of what is in the workspace, as it is: name, size, when, and a download. */
export function OtherFiles(props: { files: FileEntry[]; total: number; hasThings: boolean }) {
  const more = () => props.total - props.files.length
  return (
    <section class="thing other-files" aria-labelledby="other-files-title">
      <header class="thing-head">
        <span class="thing-icon">
          <Icon name="file" />
        </span>
        <div class="thing-titles">
          <h2 id="other-files-title" class="thing-title">
            {props.hasThings ? 'Other files in this project' : 'Files in this project'}
          </h2>
          <p class="thing-byline">{count(props.files.length, 'file')}, as they are on Ola’s computer</p>
        </div>
      </header>
      <ul class="other-list">
        <For each={props.files}>
          {(f) => (
            <li class="other-row">
              <span class="other-name">
                <Icon name={/\.(csv|xlsx?|tsv)$/i.test(f.path) ? 'table' : 'file'} size={18} />
                <span>{f.path}</span>
              </span>
              <span class="other-meta">
                {bytes(f.size)} · {f.origin === 'uploaded' ? 'you uploaded' : 'Ola made'} · {when(f.uploaded ?? f.modified)}
              </span>
              <a class="other-action" href={desk.downloadUrl(f.path)} download={f.path.split('/').pop()}>
                Download<span class="sr-only"> {f.path}</span>
              </a>
            </li>
          )}
        </For>
      </ul>
      <Show when={more() > 0}>
        <p class="other-more">
          <a href="#/files">See all {props.total} files in What Ola has of yours</a>
        </p>
      </Show>
    </section>
  )
}

/** A project with nothing in it yet says so, and points at Ask Ola. */
export function EmptyProject(props: { canRun: boolean; onAsk: () => void; onAddFiles: () => void }) {
  return (
    <section class="thing empty-project" aria-labelledby="empty-title">
      <div class="thing-body">
        <h2 id="empty-title" class="empty-title">
          Nothing here yet
        </h2>
        <Show
          when={props.canRun}
          fallback={<p class="empty-text">When the people in this project ask Ola for something, what it makes shows up here.</p>}
        >
          <p class="empty-text">Ask Ola for something and what it makes shows up here: a web page, a table, a short report. You can also add files for Ola to work with.</p>
          <div class="empty-actions">
            <button type="button" class="primary-button" onClick={props.onAsk}>
              Ask Ola
            </button>
            <button type="button" class="ghost-button on-paper" onClick={props.onAddFiles}>
              <Icon name="plus" size={16} /> Add files
            </button>
          </div>
        </Show>
      </div>
    </section>
  )
}
