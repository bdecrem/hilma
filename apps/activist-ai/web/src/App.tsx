// The app: a project opens on its things; "Ask Ola" is a bar at the bottom that opens into a
// drawer with the conversation; "What Ola has of yours" is one click from the header.
// Routes are hash routes (#/ and #/files) so the front desk serves one page for every path.
import type { Me, Role } from './lib/types.ts'
import { createEffect, createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { desk, DeskError } from './lib/api.ts'
import { createOla } from './lib/ola.ts'
import { count, people } from './lib/format.ts'
import { Icon, Wordmark } from './components/Icon.tsx'
import { EmptyProject, groupThings, OtherFiles, ThingCard } from './components/Things.tsx'
import { Drawer, ProblemBox } from './components/Drawer.tsx'
import { FilesView } from './components/FilesView.tsx'
import { ApprovalSheet } from './components/ApprovalSheet.tsx'
import { SettingsView } from './components/Settings.tsx'
import { DataView, FileTableView } from './components/DataView.tsx'
import { JobsView } from './components/JobsView.tsx'
import { QualityView } from './components/Compare.tsx'

type Route = 'home' | 'files' | 'data' | 'settings' | 'jobs' | 'table' | 'quality'
const routeOf = (hash: string): Route => (hash.startsWith('#/files') ? 'files' : hash.startsWith('#/data') ? 'data' : hash.startsWith('#/settings') ? 'settings' : hash.startsWith('#/jobs') ? 'jobs' : hash.startsWith('#/table') ? 'table' : hash.startsWith('#/quality') ? 'quality' : 'home')
// #/jobs/<id> opens one job.
const jobOf = (hash: string): string | null => /^#\/jobs\/([0-9a-f]{12})$/.exec(hash)?.[1] ?? null
const ROUTE_TITLE: Record<Route, string> = { home: '', files: 'What Ola has of yours', data: 'Data', settings: 'Settings', jobs: 'Jobs', table: 'Table', quality: 'Quality' }
/** `#/table?path=<file>`: Open on a CSV or Excel file (frontdesk/views.mjs sends it here). */
const tableOf = (hash: string): string | null => (hash.startsWith('#/table') ? new URLSearchParams(hash.split('?')[1] ?? '').get('path') : null)
/** `#/?ask=<conversation id>` opens the drawer on that conversation. */
const askOf = (hash: string): string | null => new URLSearchParams(hash.split('?')[1] ?? '').get('ask')
/** `?still` in the address: no live stream (screenshots, printing). */
const STILL = new URLSearchParams(location.search).has('still')

export function App(props: { me: Me; role: Role; onSignOut: () => void }) {
  const canRun = () => props.role !== 'viewer'
  const [route, setRoute] = createSignal<Route>(routeOf(location.hash))
  const [jobId, setJobId] = createSignal<string | null>(jobOf(location.hash))
  const onHash = () => (setRoute(routeOf(location.hash)), setJobId(jobOf(location.hash)))
  window.addEventListener('hashchange', onHash)
  onCleanup(() => window.removeEventListener('hashchange', onHash))

  // A workspace stopped for idleness is started when its project opens: until it answers, the
  // front desk says "waking" and the page asks again each second.
  const [waking, setWaking] = createSignal(false)
  const [project, { refetch }] = createResource(async () => {
    for (let tries = 0; ; tries++) {
      try {
        const p = await desk.project()
        setWaking(false)
        return p
      } catch (e) {
        if (!(e instanceof DeskError && e.status === 503 && /waking/.test(e.problem.detail ?? '')) || tries >= 90) {
          setWaking(false)
          throw e
        }
        setWaking(true)
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
  })
  const ola = createOla({ live: !STILL })
  onCleanup(() => ola.dispose())

  const [drawer, setDrawer] = createSignal(false)
  const [draft, setDraft] = createSignal('')
  const [promise, setPromise] = createSignal(false)
  const narrow = window.matchMedia('(max-width: 760px)')
  const [isNarrow, setNarrow] = createSignal(narrow.matches)
  const onNarrow = () => setNarrow(narrow.matches)
  narrow.addEventListener('change', onNarrow)
  onCleanup(() => narrow.removeEventListener('change', onNarrow))
  let drawerInput: HTMLTextAreaElement | undefined
  let barInput: HTMLInputElement | undefined
  let uploadButton: HTMLButtonElement | undefined
  let heading: HTMLHeadingElement | undefined
  let settingsTitle: HTMLHeadingElement | undefined
  const claudeOn = () => !!ola.state.claude?.enabled
  const hostedOn = () => !!ola.state.hosted?.enabled
  let promiseDialog: HTMLDialogElement | undefined

  const openDrawer = () => {
    void ola.loadClaude() // the owner may have turned a fallback on or off since this page opened
    setDrawer(true)
    queueMicrotask(() => drawerInput?.focus())
  }
  const closeDrawer = () => {
    setDrawer(false)
    queueMicrotask(() => barInput?.focus())
  }
  const working = () => {
    const t = ola.state.turns[ola.state.turns.length - 1]
    return !!t && (t.status === 'working' || t.status === 'sending')
  }
  const lastTurn = () => ola.state.turns[ola.state.turns.length - 1]

  // A question from Ola opens the drawer, so the answer it waits for is in view.
  createEffect(() => ola.state.approval && setDrawer(true))
  // Things Ola made appear on the home when a run finishes.
  createEffect((prev: string | undefined) => {
    const status = lastTurn()?.status
    if (prev && (prev === 'working' || prev === 'sending') && status && status !== 'working' && status !== 'sending') void refetch()
    return status
  })
  // A new view moves focus to its heading, so a screen reader hears where it is.
  createEffect((prev: Route | undefined) => {
    const r = route()
    if (prev && prev !== r) queueMicrotask(() => (r === 'home' ? heading : r === 'settings' ? settingsTitle : document.getElementById(r === 'files' ? 'files-title' : r === 'jobs' ? 'jobs-title' : r === 'quality' ? 'quality-title' : 'data-title'))?.focus())
    if (r === 'settings') void ola.loadClaude()
    return r
  })
  createEffect(() => {
    const p = project()?.project
    document.title = p ? `${route() !== 'home' ? `${ROUTE_TITLE[route()]} · ` : ''}${p.name} · Ola` : 'Ola'
  })
  createEffect(() => {
    if (!promiseDialog) return
    if (promise() && !promiseDialog.open) promiseDialog.showModal()
    else if (!promise() && promiseDialog.open) promiseDialog.close()
  })

  onMount(() => {
    const ask = askOf(location.hash)
    if (ask) {
      setDrawer(true)
      void ola.open(ask)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawer() && !document.querySelector('dialog[open]')) closeDrawer()
    }
    window.addEventListener('keydown', onKey)
    onCleanup(() => window.removeEventListener('keydown', onKey))
  })

  const addFiles = () => {
    if (window.matchMedia('(max-width: 1099px)').matches) setDrawer(false)
    location.hash = '#/files'
    setTimeout(() => uploadButton?.focus(), 50)
  }

  /** /files: the files view (the drawer gives way on a narrow screen, as for Add files). */
  const showFiles = () => {
    if (window.matchMedia('(max-width: 1099px)').matches) setDrawer(false)
    location.hash = '#/files'
  }
  // The bar sends what the drawer sends, slash commands included (lib/commands.ts): a command is
  // never sent to the model as text.
  const sendFromBar = (e: Event) => {
    e.preventDefault()
    const text = draft().trim()
    openDrawer()
    if (!text) return
    const r = ola.typed(text)
    if (!r.keep) setDraft('')
    if (r.files) showFiles()
  }

  const p = () => project()?.project
  const machine = () => project()?.machine

  return (
    <div class="app" classList={{ 'drawer-open': drawer() }}>
      <a class="skip-link" href="#main">
        Skip to the content
      </a>
      <header class="topbar">
        <a class="brand" href="#/" aria-label="Ola, back to the project">
          <Wordmark />
        </a>
        <nav class="crumbs" aria-label="Where you are">
          <Show when={p()}>
            <Show when={route() !== 'home'} fallback={<span class="crumb-muted">{p()!.group}</span>}>
              <a href="#/">{p()!.name}</a>
            </Show>
            <span class="crumb-sep" aria-hidden="true">
              /
            </span>
            <span class="crumb-here" aria-current="page">
              {route() !== 'home' ? ROUTE_TITLE[route()] : p()!.name}
            </span>
          </Show>
        </nav>
        <div class="topbar-right">
          <Show when={machine()}>
            {(m) => (
              <p class="machine" title="How many people are working on Ola’s computer right now. It never says who.">
                <span class="machine-lights" aria-hidden="true">
                  <For each={Array.from({ length: m().capacity }, (_, i) => i < m().working)}>{(on) => <span class="light" classList={{ on }} />}</For>
                </span>
                <span class="machine-text">{m().working === 1 ? 'One person' : `${m().working} people`} working on the machine</span>
              </p>
            )}
          </Show>
          <button type="button" class="ghost-button on-room" onClick={() => setPromise(true)}>
            <Icon name="machine" size={18} /> <span class="narrow-hide">On this machine</span>
          </button>
          <button type="button" class="ghost-button on-room signout" onClick={props.onSignOut} title={`Signed in as ${props.me.person.name}`}>
            Sign out
          </button>
        </div>
      </header>

      <main id="main" class="main" tabindex="-1">
        <Show when={project.error}>
          <div class="page-problem">
            <ProblemBox problem={project.error instanceof DeskError ? project.error.problem : { text: 'The project could not be loaded.', detail: String(project.error) }} role="alert" />
          </div>
        </Show>
        <Show
          when={route() === 'home'}
          fallback={
            <>
              <a class="back-link" href="#/">
                {/* "Back to one thing" read oddly in a project full of files (first-user pass). */}
                <Icon name="back" size={16} /> Back to the project
              </a>
              <Show when={route() === 'files'}>
                <FilesView onChanged={() => void refetch()} uploadRef={(el) => (uploadButton = el)} canWrite={canRun()} deleteNotice={props.me.policy.deleteNotice} claudeOn={claudeOn()} hostedOn={hostedOn()} />
              </Show>
              <Show when={route() === 'data'}>
                <DataView />
              </Show>
              <Show when={route() === 'jobs'}>
                <JobsView jobId={jobId()} />
              </Show>
              <Show when={route() === 'table' && tableOf(location.hash)} keyed>
                {(path) => <FileTableView path={path} />}
              </Show>
              <Show when={route() === 'settings'}>
                <SettingsView ola={ola} titleRef={(el) => (settingsTitle = el)} canWrite={canRun()} />
              </Show>
              {/* Bart's own page (admins only; the front desk answers 404 to anyone else). */}
              <Show when={route() === 'quality' && props.me.person.admin}>
                <QualityView />
              </Show>
            </>
          }
        >
          <section class="project-head" aria-labelledby="project-title">
            <div>
              <h1 id="project-title" class="project-title" ref={heading} tabindex="-1">
                {p()?.name ?? 'Your project'}
              </h1>
              <Show when={p()}>
                <p class="project-sub">
                  {p()!.group} · {people(p()!.people)} ·{' '}
                  <Show when={project()!.things.length} fallback={<strong>nothing made yet</strong>}>
                    <strong>{count(project()!.things.length, 'thing')}</strong>
                  </Show>
                  <Show when={p()!.filesUploaded}>
                    , from <strong>{count(p()!.filesUploaded, 'file')} you uploaded</strong>
                  </Show>
                </p>
              </Show>
            </div>
            <div class="project-actions">
              <a class="ghost-button on-room" href="#/files">
                <Icon name="eye" size={18} /> What Ola has of yours
              </a>
              <a class="ghost-button on-room" href="#/data">
                <Icon name="table" size={18} /> Data
              </a>
              <a class="ghost-button on-room" href="#/jobs">
                <Icon name="run" size={18} /> Jobs
              </a>
              <Show when={canRun()}>
                <button type="button" class="ghost-button on-room" onClick={addFiles}>
                  <Icon name="plus" size={18} /> Add files
                </button>
              </Show>
              <a class="ghost-button on-room" href="#/settings">
                <Icon name="settings" size={18} /> Settings
              </a>
              <Show when={props.me.person.admin}>
                <a class="ghost-button on-room" href="#/quality">
                  <Icon name="table" size={18} /> Quality
                </a>
              </Show>
            </div>
          </section>
          <Show when={project()} fallback={<p class="loading" role="status">{waking() ? 'Waking your project. This takes a few seconds…' : 'Opening your project…'}</p>}>
            <Show when={project()!.things.length || project()!.files?.length} fallback={<EmptyProject canRun={canRun()} onAsk={openDrawer} onAddFiles={addFiles} />}>
              {/* What Ola made, by kind: pages, charts and images, tables, documents. */}
              <For each={groupThings(project()!.things)}>
                {(g) => (
                  <section class="thing-group" aria-labelledby={`group-${g.key}`} data-group={g.key}>
                    <h2 id={`group-${g.key}`} class="group-title">
                      {g.title} <span class="group-count">{g.things.length}</span>
                    </h2>
                    <div class="things" role="list" aria-label={g.title}>
                      <For each={g.things}>
                        {(t) => (
                          <div role="listitem" class="thing-slot" data-kind={t.kind}>
                            <ThingCard thing={t} />
                          </div>
                        )}
                      </For>
                    </div>
                  </section>
                )}
              </For>
              <Show when={project()!.files?.length}>
                <OtherFiles files={project()!.files!} total={project()!.otherTotal ?? project()!.files!.length} hasThings={!!project()!.things.length} />
              </Show>
            </Show>
          </Show>
        </Show>
      </main>

      <Show when={!canRun()}>
        <p class="viewer-note" role="note">
          You can read this project. Asking Ola and adding or deleting files are for its owner and members.
        </p>
      </Show>
      <div class="askdock" classList={{ hidden: drawer() || !canRun() || route() === 'quality' }}>
        <form class="askbar" onSubmit={sendFromBar} aria-label="Ask Ola">
          <button type="button" class="askbar-open" onClick={openDrawer} aria-expanded={drawer()} aria-controls="ask-drawer" aria-label="Ask Ola">
            <span class="drawer-mark" classList={{ working: working() }} aria-hidden="true" />
            <span>Ask Ola</span>
          </button>
          <label for="askbar-input" class="sr-only">
            Your request
          </label>
          <input id="askbar-input" ref={barInput} type="text" autocomplete="off" placeholder={isNarrow() ? 'Ask for something…' : 'Make something new, or change one of these…'} value={draft()} onInput={(e) => setDraft(e.currentTarget.value)} />
          <button type="button" class="link-button on-paper askbar-files" onClick={addFiles}>
            <Icon name="plus" size={16} /> Add files
          </button>
          <button type="submit" class="send-button" aria-label="Send to Ola">
            <Icon name="up" />
          </button>
        </form>
          <Show when={working() || ola.state.connection === 'lost' || ola.state.approval}>
            <p class="askbar-status" role="status">
              <Show when={ola.state.connection === 'lost'} fallback={
                <Show when={ola.state.approval} fallback={<>
                  <span class="lamp-dot" aria-hidden="true" /> Ola is working on your request · {count(lastTurn()?.steps.length ?? 0, 'step')} so far ·{' '}
                </>}>
                  <span class="mark-dot" aria-hidden="true" /> Ola is waiting for your yes ·{' '}
                </Show>
              }>
                <span class="mark-dot" aria-hidden="true" /> Lost the connection to Ola’s computer. Trying again ·{' '}
              </Show>
              <button type="button" class="link-button on-room" onClick={openDrawer}>
                Open the drawer
              </button>
            </p>
          </Show>
      </div>

      <Drawer ola={ola} open={drawer()} onClose={closeDrawer} onAddFiles={addFiles} onFiles={showFiles} draft={draft()} setDraft={setDraft} inputRef={(el) => (drawerInput = el)} />
      <ApprovalSheet ola={ola} provider={props.me.policy.searchProvider} />

      <dialog ref={promiseDialog} class="sheet promise" aria-labelledby="promise-title" onClose={() => setPromise(false)}>
        <div class="sheet-inner">
          <h2 id="promise-title" class="sheet-title">
            On this machine
          </h2>
          <p class="sheet-lede">Everything you do here runs on one Mac that Bart owns, in his office. The model that reads your files runs on it too.</p>
          <ul class="promise-list">
            <Show
              when={claudeOn() || hostedOn()}
              fallback={<li>Your files and requests are not sent to any AI company or cloud service.</li>}
            >
              <Show when={hostedOn()}>
                <li>
                  {`This project’s owner turned on Fallback to a hosted open model. A request you hand to it, this conversation so far, and the parts of your files it reads go to ${ola.state.hosted?.provider ?? 'an outside company'}; each such reply is marked “Hosted open model, outside this machine”. Everything you ask Ola stays here.`}
                </li>
              </Show>
              <Show when={claudeOn()}>
                <li>
                  This project’s owner turned on Fallback to Claude. A request you hand to Claude, and the parts of your files Claude reads to answer it, go to Anthropic; each such reply is marked “Claude, outside this machine”. Everything you ask Ola stays here.
                </li>
              </Show>
            </Show>
            <li>Ola can read only the files you upload, listed under “What Ola has of yours”.</li>
            <li>Your conversations stay in your project until you delete them. Bart, who runs the machine, could read a conversation while it runs; he does not keep logs of what you ask.</li>
            <li>A web search or a download asks you first, unless your project said Always (Settings). Only the words of the search, or the one address, leave the machine; your files never do.</li>
          </ul>
          <div class="sheet-actions">
            <button type="button" class="primary-button" onClick={() => setPromise(false)}>
              Close
            </button>
          </div>
        </div>
      </dialog>
    </div>
  )
}
