// The project's things, each as paper on the desk: a header band (icon, title, who made it and
// when) and a body that shows the thing itself, never a thumbnail too small to read.
import { createResource, createSignal, For, Match, Show, Switch } from 'solid-js'
import type { Byline, ChartThing, DashboardThing, DocumentThing, FileDocThing, FileEntry, ImageThing, ProjectLink, SiteThing, SourceThing, TableThing, Thing } from '../lib/types.ts'
import { bytes, count, when } from '../lib/format.ts'
import { canOpen, desk } from '../lib/api.ts'
import { Icon } from './Icon.tsx'

function byline(b: Byline): string {
  const by = b.madeBy === 'bart' ? 'Built by Bart with you' : b.madeBy === 'you' ? 'Made by you with Ola' : b.madeBy === 'group' ? (b.who ?? 'Made together') : 'Ola'
  const parts = [by]
  if (b.madeBy !== 'bart') parts.push(when(b.when))
  if (b.from.length) parts.push(`from ${b.from.join(' and ')}`)
  return parts.join(' · ')
}

/** `onPublish`: the owner's Publish on a page (OLA-209); `published`: its public address, when it is. */
export function ThingCard(props: { thing: Thing; onPublish?: (file: string) => void; published?: string | null }) {
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
            <Show when={props.onPublish}>
              <button type="button" class="thing-action thing-publish" onClick={() => props.onPublish!(t().file!)}>
                {props.published ? 'Published' : 'Publish'}
                <span class="sr-only"> {t().title} on the web</span>
              </button>
            </Show>
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
            <Site thing={t() as SiteThing} published={props.published ?? null} />
          </Match>
          <Match when={t().kind === 'image'}>
            <Picture thing={t() as ImageThing} />
          </Match>
          <Match when={t().kind === 'filedoc'}>
            <FileDoc thing={t() as FileDocThing} />
          </Match>
        </Switch>
      </div>
    </article>
  )
}

// A picture Ola made, as itself: loaded as an image only (/api/thumb answers nothing else), so an
// SVG's scripts never run. Open shows it full size.
function Picture(props: { thing: ImageThing }) {
  const [failed, setFailed] = createSignal(false)
  return (
    <a class="pic-frame" href={desk.openUrl(props.thing.file!)} target="_blank" rel="noopener noreferrer">
      <Show when={!failed()} fallback={<span class="pic-missing">This picture could not be shown here. Open or Download it.</span>}>
        <img src={desk.thumbUrl(props.thing.file!)} alt={props.thing.alt} loading="lazy" onError={() => setFailed(true)} />
      </Show>
      <span class="sr-only">Open {props.thing.title} in a new tab</span>
    </a>
  )
}

// A PDF or a Word file Ola made: a PDF's first page as a picture; Open shows every page.
function FileDoc(props: { thing: FileDocThing }) {
  const [failed, setFailed] = createSignal(false)
  return (
    <div class="filedoc">
      <Show when={props.thing.format === 'PDF' && !failed()}>
        <a class="filedoc-page" href={desk.openUrl(props.thing.file!)} target="_blank" rel="noopener noreferrer">
          <img src={desk.thumbUrl(props.thing.file!)} alt={`The first page of ${props.thing.title}`} loading="lazy" onError={() => setFailed(true)} />
          <span class="sr-only">Open {props.thing.title} in a new tab</span>
        </a>
      </Show>
      <p class="site-summary">{props.thing.format === 'PDF' ? 'A PDF Ola made. Open shows its pages here, one under the other.' : 'A Word document Ola made. Open shows it as a readable page; Download has the file to edit.'}</p>
    </div>
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
  // An Excel file is not read for the home: its note says Open shows it.
  if (!props.thing.columns.length) return <p class="site-summary">{props.thing.note}</p>
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

function Site(props: { thing: SiteThing; published: string | null }) {
  const s = () => props.thing
  return (
    <div class="site">
      <p class="site-summary">{s().summary}</p>
      <p class="site-meta">
        {s().pages === 1 ? 'One page' : `${s().pages} pages`} ·{' '}
        <Show when={props.published} fallback={s().visibility === 'private' ? 'Private: only the people in this project can open it. It is not on the public web.' : 'Public'}>
          Public at{' '}
          <a href={props.published!} target="_blank" rel="noopener noreferrer">
            {props.published!.replace(/^https?:\/\//, '')}
          </a>
        </Show>
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
              <span class="other-actions">
                <Show when={canOpen(f.path)}>
                  <a class="other-action" href={desk.openUrl(f.path)} target="_blank" rel="noopener noreferrer">
                    Open<span class="sr-only"> {f.path} in a new tab</span>
                  </a>
                </Show>
                <a class="other-action" href={desk.downloadUrl(f.path)} download={f.path.split('/').pop()}>
                  Download<span class="sr-only"> {f.path}</span>
                </a>
              </span>
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

/** The home's groups, in order: what Ola made, by kind. A kind with nothing in it is left out. */
export const THING_GROUPS: { key: string; title: string; kinds: Thing['kind'][] }[] = [
  { key: 'pages', title: 'Pages', kinds: ['site', 'dashboard'] },
  { key: 'charts', title: 'Charts and images', kinds: ['chart', 'image'] },
  { key: 'tables', title: 'Tables', kinds: ['table'] },
  { key: 'documents', title: 'Documents', kinds: ['document', 'filedoc'] },
]
export const groupThings = (things: Thing[]) => THING_GROUPS.map((g) => ({ ...g, things: things.filter((t) => g.kinds.includes(t.kind)) })).filter((g) => g.things.length)

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

/** The address as a person reads it: no "https://", no "www.", no trailing slash. */
export const shortAddress = (u: string) => u.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')

/**
 * What Ola downloaded from the web to read (sources/), apart from what it made: each with the
 * address it came from and the day, from the project database. Never "a web page Ola made".
 */
export function Sources(props: { sources: SourceThing[] }) {
  const [docs] = createResource(
    () => props.sources.map((s) => s.file).join('|') || false,
    () => desk.docs({}).catch(() => null),
  )
  const info = (path: string | null | undefined) => {
    const d = docs()
    const rows = d && !d.q ? d.documents : []
    return rows.find((r) => r.path === path) ?? null
  }
  return (
    <section class="sources" aria-labelledby="sources-title" data-group="sources">
      <h2 id="sources-title" class="group-title">
        Sources <span class="group-count">{props.sources.length}</span>
      </h2>
      <p class="sources-lede">What Ola downloaded from the web to read. Ola did not make these.</p>
      <ul class="source-list">
        <For each={props.sources}>
          {(src) => {
            const row = () => info(src.file)
            return (
              <li class="source-row" data-kind="source">
                <span class="source-icon" aria-hidden="true">
                  <Icon name="search" size={18} />
                </span>
                <div class="source-main">
                  <p class="source-title">{src.title}</p>
                  <Show when={row()?.source_url} fallback={<p class="source-address muted">{src.file}</p>}>
                    <a class="source-address" href={row()!.source_url!} target="_blank" rel="noopener noreferrer">
                      {shortAddress(row()!.source_url!)}
                      <span class="sr-only"> (the original page on the web, in a new tab)</span>
                    </a>
                  </Show>
                  <p class="source-meta">
                    Downloaded {when(row()?.fetched_at ?? src.byline.when)} · {src.format === 'page' ? 'a web page' : src.format === 'PDF' ? 'a PDF' : 'a file'}
                  </p>
                </div>
                <Show when={src.file}>
                  <a class="source-open" href={desk.openUrl(src.file!)} target="_blank" rel="noopener noreferrer">
                    Open<span class="sr-only"> the saved copy of {src.title}, in a new tab</span>
                  </a>
                </Show>
              </li>
            )
          }}
        </For>
      </ul>
    </section>
  )
}

/**
 * What the project's people already use somewhere else (OLA-103): the Adaptation Almanac in
 * Frances's project, the MRD law library in Ian's. Set by the admin (`admin.mjs link`); each opens
 * at its own address in a new tab. Ola does not read them.
 */
export function Elsewhere(props: { links: ProjectLink[] }) {
  return (
    <section class="elsewhere" aria-labelledby="elsewhere-title" data-group="elsewhere">
      <h2 id="elsewhere-title" class="group-title">
        Also yours <span class="group-count">{props.links.length}</span>
      </h2>
      <p class="sources-lede">Made for this work before Ola. Each one stays at its own address.</p>
      <ul class="source-list">
        <For each={props.links}>
          {(l) => (
            <li class="source-row elsewhere-row">
              <span class="source-icon" aria-hidden="true">
                <Icon name="away" size={18} />
              </span>
              <a class="elsewhere-main" href={l.url} target="_blank" rel="noopener noreferrer">
                <span class="source-title">{l.label}</span>
                <span class="source-address">{shortAddress(l.url)}</span>
                <Show when={l.note}>
                  <span class="source-meta">{l.note}</span>
                </Show>
                <span class="sr-only"> (opens in a new tab)</span>
              </a>
              <span class="source-open" aria-hidden="true">
                Open
              </span>
            </li>
          )}
        </For>
      </ul>
    </section>
  )
}
