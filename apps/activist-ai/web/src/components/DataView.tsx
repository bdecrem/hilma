// "Data": the project's database, to look at, search and download. Read-only in this round.
// The tables Ola made (rows, where each came from, what it holds), one table at a time paged and
// sortable, and the documents with a search across their text that cites the page. Everything
// comes from the front desk's /api/data routes, which ask the project's own computer.
import { createEffect, createResource, createSignal, For, Show } from 'solid-js'
import { desk, DeskError } from '../lib/api.ts'
import type { DataTable, Problem, TablePage } from '../lib/types.ts'
import { bytes, cap, count, when } from '../lib/format.ts'
import { Icon } from './Icon.tsx'
import { ProblemBox } from './Drawer.tsx'

const PAGE = 50
const num = (n: number) => n.toLocaleString('en-US')
const problemOf = (e: unknown, text: string): Problem => (e instanceof DeskError ? e.problem : { text, detail: String(e) })

export function DataView() {
  const [data, { refetch }] = createResource(() => desk.data())
  const [open, setOpen] = createSignal<DataTable | null>(null)
  let tableHead: HTMLHeadingElement | undefined

  const tables = () => data()?.tables ?? []
  const docs = () => data()?.documents

  const openTable = (t: DataTable) => {
    setOpen(t)
    queueMicrotask(() => tableHead?.focus())
  }

  return (
    <section class="files-sheet data-sheet" aria-labelledby="data-title">
      <div class="files-inner">
        <div class="files-top">
          <div>
            <h1 id="data-title" class="files-title" tabindex="-1">
              Your project’s data
            </h1>
            <p class="files-lede">
              <Show when={data()} fallback="Looking at what Ola has put in order…">
                <strong>
                  {cap(count(tables().length, 'table'))} and {count(docs()?.count ?? 0, 'document')},
                </strong>{' '}
                in one database on this machine, kept with your project. Ola adds to it as it works; here you can look, search and take a copy.
              </Show>
            </p>
          </div>
          <div class="files-upload">
            <a class="primary-button" href={desk.databaseUrl()} download="">
              <Icon name="down" size={18} /> Download the database
            </a>
            <p class="upload-line">
              One file{data() ? `, ${bytes(data()!.size)}` : ''}, with everything on this page: a copy to keep, or to open in a database program.
            </p>
          </div>
        </div>

        <Show when={data.error}>
          <div class="data-problem">
            <ProblemBox problem={problemOf(data.error, 'The project’s data could not be loaded.')} role="alert" />
            <button type="button" class="link-button on-paper" onClick={() => void refetch()}>
              Try again
            </button>
          </div>
        </Show>

        <Show when={data()}>
          <Show
            when={open()}
            fallback={
              <section class="file-group" aria-labelledby="data-tables">
                <h2 id="data-tables" class="file-group-title">
                  Tables
                </h2>
                <Show when={tables().length} fallback={<p class="meta empty-files">No tables yet. Ask Ola to put a spreadsheet or the results of its work in a table, and it appears here.</p>}>
                  <table class="files data-tables">
                    <thead>
                      <tr>
                        <th scope="col">Table</th>
                        <th scope="col" class="num">
                          Rows
                        </th>
                        <th scope="col">Came from</th>
                        <th scope="col">
                          <span class="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={tables()}>
                        {(t) => (
                          <tr>
                            <td>
                              <button type="button" class="table-name" onClick={() => openTable(t)}>
                                <Icon name="table" size={18} />
                                <span>{t.name}</span>
                              </button>
                              <span class="file-meta">{t.description ?? `${count(t.columns.length, 'column')}: ${t.columns.slice(0, 4).map((c) => c.name).join(', ')}${t.columns.length > 4 ? ', …' : ''}`}</span>
                            </td>
                            <td class="num">{num(t.rows)}</td>
                            <td class="data-source">
                              {t.source === 'made by Ola' || !t.source ? 'Made by Ola' : t.source}
                              <Show when={t.updated}>
                                <span class="file-meta flush">{t.source === 'made by Ola' || !t.source ? 'changed' : 'loaded'} {when(t.updated!)}</span>
                              </Show>
                            </td>
                            <td class="file-actions">
                              <button type="button" class="link-button on-paper" onClick={() => openTable(t)}>
                                Open<span class="sr-only"> {t.name}</span>
                              </button>
                              <a href={desk.excelUrl(t.name)} download={`${t.name}.xlsx`}>
                                Excel<span class="sr-only"> download of {t.name}</span>
                              </a>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </Show>
              </section>
            }
          >
            {(t) => <TableBrowser table={t()} onClose={() => setOpen(null)} headRef={(el) => (tableHead = el)} />}
          </Show>
          <Show when={!open()}>
            <Documents total={docs()?.count ?? 0} pages={docs()?.pages ?? 0} />
          </Show>
        </Show>
      </div>
    </section>
  )
}

function TableBrowser(props: { table: DataTable; onClose: () => void; headRef: (el: HTMLHeadingElement) => void }) {
  const [offset, setOffset] = createSignal(0)
  const [sort, setSort] = createSignal<{ col: string; dir: 'asc' | 'desc' } | null>(null)
  const [q, setQ] = createSignal('')
  const [typed, setTyped] = createSignal('')
  const [page] = createResource(
    () => ({ name: props.table.name, offset: offset(), sort: sort(), q: q() }),
    (k) => desk.table(k.name, { offset: k.offset, limit: PAGE, sort: k.sort?.col, dir: k.sort?.dir, q: k.q || undefined }),
  )
  // Keep the last page on screen while the next one loads, so the table does not jump.
  const [shown, setShown] = createSignal<TablePage | null>(null)
  createEffect(() => {
    const p = page()
    if (p) setShown(p)
  })
  const toggle = (col: string) => {
    const s = sort()
    setSort(!s || s.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : null)
    setOffset(0)
  }
  const search = (e: Event) => {
    e.preventDefault()
    setQ(typed().trim())
    setOffset(0)
  }
  const numeric = (type: string) => /INT|REAL|NUM|FLOA|DOUB/i.test(type)
  return (
    <section class="table-browser" aria-labelledby="table-title">
      <button type="button" class="link-button on-paper" onClick={props.onClose}>
        <Icon name="back" size={16} /> All tables and documents
      </button>
      <div class="table-head">
        <div>
          <h2 id="table-title" class="table-title" ref={props.headRef} tabindex="-1">
            {props.table.name}
          </h2>
          <p class="table-sub">
            {props.table.description ? `${props.table.description} · ` : ''}
            {num(props.table.rows)} rows · {props.table.source === 'made by Ola' || !props.table.source ? 'made by Ola' : `from ${props.table.source}`}
          </p>
        </div>
        <a class="ghost-button on-paper small" href={desk.excelUrl(props.table.name)} download={`${props.table.name}.xlsx`}>
          <Icon name="down" size={16} /> Download as Excel
        </a>
      </div>
      <form class="data-search" role="search" onSubmit={search}>
        <label for="table-q">Search this table</label>
        <div class="data-search-row">
          <input id="table-q" type="search" value={typed()} onInput={(e) => setTyped(e.currentTarget.value)} placeholder="A name, a word, a number" autocomplete="off" />
          <button type="submit" class="ghost-button on-paper small">
            Search
          </button>
        </div>
      </form>
      <Show when={page.error}>
        <ProblemBox problem={problemOf(page.error, 'This table could not be read.')} role="alert" />
      </Show>
      <Show when={shown()}>
        {(pg) => (
          <>
            <p class="table-count" role="status" aria-live="polite">
              <Show when={pg().total} fallback={q() ? `No row has “${q()}”.` : 'This table is empty.'}>
                Rows {num(pg().offset + 1)} to {num(Math.min(pg().offset + pg().rows.length, pg().total))} of {num(pg().total)}
                {q() ? ` with “${q()}”` : ''}
                {page.loading ? ' · loading…' : ''}
              </Show>
            </p>
            <div class="grid-wrap" tabindex="0" aria-label={`The table ${props.table.name}; scrolls sideways`}>
              <table class="grid">
                <thead>
                  <tr>
                    <For each={pg().columns}>
                      {(c) => (
                        <th scope="col" classList={{ num: numeric(c.type) }} aria-sort={sort()?.col === c.name ? (sort()!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          <button type="button" onClick={() => toggle(c.name)}>
                            {c.name}
                            <span class="sort-mark" aria-hidden="true">
                              {sort()?.col === c.name ? (sort()!.dir === 'asc' ? '▲' : '▼') : ''}
                            </span>
                          </button>
                        </th>
                      )}
                    </For>
                  </tr>
                </thead>
                <tbody>
                  <For each={pg().rows}>
                    {(r) => (
                      <tr>
                        <For each={r}>{(v, i) => <td classList={{ num: numeric(pg().columns[i()]?.type ?? ''), none: v === null }}>{v === null ? '–' : String(v)}</td>}</For>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
            <div class="pager">
              <button type="button" class="ghost-button on-paper small" disabled={offset() === 0 || page.loading} onClick={() => setOffset(Math.max(0, offset() - PAGE))}>
                Previous {PAGE}
              </button>
              <button type="button" class="ghost-button on-paper small" disabled={offset() + PAGE >= pg().total || page.loading} onClick={() => setOffset(offset() + PAGE)}>
                Next {PAGE}
              </button>
            </div>
          </>
        )}
      </Show>
    </section>
  )
}

/** A passage with the matched words marked (the database puts them between \u0002 and \u0003). */
function Marked(props: { text: string }) {
  const parts = () => props.text.replace(/\s+/g, ' ').split(/(\u0002[^\u0003]*\u0003)/)
  return (
    <For each={parts()}>{(p) => (p.startsWith('\u0002') ? <mark>{p.slice(1, -1)}</mark> : <>{p}</>)}</For>
  )
}

function Documents(props: { total: number; pages: number }) {
  const [q, setQ] = createSignal('')
  const [typed, setTyped] = createSignal('')
  const [offset, setOffset] = createSignal(0)
  const [page] = createResource(() => ({ q: q(), offset: offset() }), (k) => desk.docs({ q: k.q || undefined, offset: k.offset }))
  const search = (e: Event) => {
    e.preventDefault()
    setQ(typed().trim())
    setOffset(0)
  }
  const unitWord = (u: string, n: number, chars: number) => (u === 'slide' ? count(n, 'slide') : u === 'part' ? `${num(Math.max(1, Math.round(chars / 6 / 10) * 10))} words` : count(n, 'page'))
  return (
    <section class="file-group" aria-labelledby="data-docs">
      <h2 id="data-docs" class="file-group-title">
        Documents
      </h2>
      <Show when={props.total} fallback={<p class="meta empty-files">No documents yet. PDFs, pages and text you upload, and what Ola downloads, are kept here with their text, so they can be searched.</p>}>
        <form class="data-search" role="search" onSubmit={search}>
          <label for="docs-q">Search the text of {count(props.total, 'document')} ({num(props.pages)} pages)</label>
          <div class="data-search-row">
            <input id="docs-q" type="search" value={typed()} onInput={(e) => setTyped(e.currentTarget.value)} placeholder="Words to find, like sea walls" autocomplete="off" />
            <button type="submit" class="ghost-button on-paper small">
              Search
            </button>
            <Show when={q()}>
              <button type="button" class="link-button on-paper" onClick={() => (setTyped(''), setQ(''), setOffset(0))}>
                Show all documents
              </button>
            </Show>
          </div>
        </form>
        <Show when={page.error}>
          <ProblemBox problem={problemOf(page.error, 'The documents could not be read.')} role="alert" />
        </Show>
        <Show when={page()}>
          {(pg) => {
            const v = pg()
            return v.q ? (
              <>
                <p class="table-count" role="status" aria-live="polite">
                  {v.total ? `${cap(count(v.total, 'passage'))} ${v.anyWord ? 'with some of the words (none had all of them)' : `with “${q()}”`}` : `Nothing in the documents mentions “${q()}”.`}
                </p>
                <ol class="hits">
                  <For each={v.hits}>
                    {(h) => (
                      <li class="hit">
                        <p class="hit-where">
                          <strong>{h.title}</strong>
                          {h.unit === 'part' ? (h.page > 1 ? ` · part ${h.page}` : '') : ` · ${h.unit} ${h.page}`}
                        </p>
                        <p class="hit-text">
                          <Marked text={h.snip} />
                        </p>
                        <p class="meta hit-from">
                          {h.path}
                          {' · '}
                          {h.source_url ? (
                            <a href={h.source_url} target="_blank" rel="noopener noreferrer">
                              {hostOf(h.source_url)}
                            </a>
                          ) : (
                            'uploaded'
                          )}
                          {h.fetched_at ? `, downloaded ${when(h.fetched_at)}` : ''}
                        </p>
                      </li>
                    )}
                  </For>
                </ol>
              </>
            ) : (
              <table class="files data-docs">
                <thead>
                  <tr>
                    <th scope="col">Document</th>
                    <th scope="col" class="num">
                      Length
                    </th>
                    <th scope="col">Came from</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={v.documents}>
                    {(d) => (
                      <tr>
                        <td>
                          <span class="file-name">
                            <Icon name="document" size={18} />
                            <span>{d.title}</span>
                          </span>
                          <span class="file-meta">{d.path}</span>
                        </td>
                        <td class="num">{unitWord(d.unit, d.pages, d.chars ?? 0)}</td>
                        <td class="data-source">
                          <Show when={d.source_url} fallback="Uploaded">
                            <a href={d.source_url!} target="_blank" rel="noopener noreferrer">
                              {hostOf(d.source_url!)}
                            </a>
                          </Show>
                          <span class="file-meta flush">{d.fetched_at ? `downloaded ${when(d.fetched_at)}` : when(d.added_at)}</span>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            )
          }}
        </Show>
        <Show when={page() && page()!.total > PAGE}>
          <div class="pager">
            <button type="button" class="ghost-button on-paper small" disabled={offset() === 0} onClick={() => setOffset(Math.max(0, offset() - PAGE))}>
              Previous
            </button>
            <button type="button" class="ghost-button on-paper small" disabled={offset() + PAGE >= (page()?.total ?? 0)} onClick={() => setOffset(offset() + PAGE)}>
              Next
            </button>
          </div>
        </Show>
      </Show>
    </section>
  )
}

function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}
