// The app: a project opens on its things; "Ask Ola" is a bar at the bottom that opens into a
// drawer with the conversation; "What Ola has of yours" is one click from the header.
// Routes are hash routes (#/ and #/files) so the front desk serves one page for every path.
import type { Me, Role, SourceThing } from './lib/types.ts'
import { createEffect, createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { desk, DeskError } from './lib/api.ts'
import { createOla } from './lib/ola.ts'
import { count, people } from './lib/format.ts'
import { Icon, Wordmark } from './components/Icon.tsx'
import { EmptyProject, groupThings, OtherFiles, Sources, ThingCard } from './components/Things.tsx'
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

  const openDrawer = (focus = true) => {
    void ola.loadClaude() // the owner may have turned a fallback on or off since this page opened
    setDrawer(true)
    if (isNarrow()) window.scrollTo(0, 0)
    if (focus) queueMicrotask(() => drawerInput?.focus())
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
  // What Ola made, and apart from it what it downloaded from the web (sources/).
  const madeThings = () => (project()?.things ?? []).filter((t) => t.kind !== 'source')
  const sources = () => (project()?.things ?? []).filter((t): t is SourceThing => t.kind === 'source')

  // On a phone the project is one of three pages under its name: the conversation (where it
  // opens), what Ola made, and its sources. The conversation is the drawer, laid in the page.
  const [view, setView] = createSignal<'made' | 'sources'>('made')
  const tab = () => (drawer() && canRun() ? 'talk' : view())
  const showTab = (t: 'talk' | 'made' | 'sources') => {
    if (t === 'talk') return openDrawer(false)
    setView(t)
    setDrawer(false)
  }
  // Where the drawer starts on a phone: under the project's name and the tabs, which stay in view.
  let head: HTMLElement | undefined
  const [drawerTop, setDrawerTop] = createSignal(0)
  const measure = () => head && setDrawerTop(Math.round(head.getBoundingClientRect().bottom + window.scrollY))
  onMount(() => {
    const ro = new ResizeObserver(measure)
    queueMicrotask(() => {
      head = document.querySelector('.project-head') as HTMLElement | undefined
      if (head) ro.observe(head)
      measure()
    })
    onCleanup(() => ro.disconnect())
  })
  createEffect(() => {
    void project()
    void isNarrow()
    queueMicrotask(measure)
  })
  // A phone opens the project on its conversation (the person asks; what was made is a tab away).
  let opened = false
  createEffect(() => {
    if (opened || !project() || route() !== 'home') return
    opened = true
    if (isNarrow() && canRun() && !drawer()) openDrawer(false)
  })

  const [menu, setMenu] = createSignal(false)
  let menuDialog: HTMLDialogElement | undefined
  createEffect(() => {
    if (!menuDialog) return
    if (menu() && !menuDialog.open) menuDialog.showModal()
    else if (!menu() && menuDialog.open) menuDialog.close()
  })
  const go = (hash: string) => {
    setMenu(false)
    if (isNarrow()) setDrawer(false)
    location.hash = hash
  }

  return (
    <div class="app" classList={{ 'drawer-open': drawer(), 'on-home': route() === 'home' }} style={{ '--drawer-top': `${drawerTop()}px` }}>
      <a class="skip-link" href="#main">
        Skip to the content
      </a>
      <header class="topbar">
        <a class="brand" href="#/" aria-label="Ola, back to the project">
          <Wordmark />
        </a>
        <nav class="crumbs" aria-label="Where you are">
          <Show when={p() && route() !== 'home'}>
            <a href="#/">{p()!.name}</a>
            <span class="crumb-sep" aria-hidden="true">
              /
            </span>
            <span class="crumb-here" aria-current="page">
              {ROUTE_TITLE[route()]}
            </span>
          </Show>
        </nav>
        <div class="topbar-right">
          <button type="button" class="ghost-button on-room on-room-wide" onClick={() => setPromise(true)}>
            <Icon name="machine" size={18} /> On this machine
          </button>
          <button type="button" class="ghost-button on-room signout on-room-wide" onClick={props.onSignOut} title={`Signed in as ${props.me.person.name}`}>
            Sign out
          </button>
          <button type="button" class="ghost-button on-room menu-button" aria-haspopup="dialog" onClick={() => setMenu(true)}>
            <span class="menu-lines" aria-hidden="true" /> Menu
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
                <SettingsView ola={ola} titleRef={(el) => (settingsTitle = el)} canWrite={canRun()} showDevices={!!props.me.devices && (props.me.devices.allowed || props.me.devices.count > 0)} />
              </Show>
              {/* Bart's own page (admins only; the front desk answers 404 to anyone else). */}
              <Show when={route() === 'quality' && props.me.person.admin}>
                <QualityView />
              </Show>
            </>
          }
        >
          <section class="project-head" aria-labelledby="project-title">
            <a class="to-projects" href="/#/projects">
              <Icon name="back" size={16} /> Your projects
            </a>
            <p class="project-kicker" aria-hidden="true">
              Project
            </p>
            <h1 id="project-title" class="project-title" ref={heading} tabindex="-1">
              {p()?.name ?? 'Your project'}
            </h1>
            <Show when={p()}>
              <p class="project-sub">
                {p()!.group} · {p()!.people.length > 1 ? `with ${people(p()!.people.filter((x) => x !== 'you'))}` : 'just you'}
              </p>
            </Show>
            {/* The other places of the project, on a laptop: one quiet row (on a phone, the Menu). */}
            <nav class="project-links" aria-label="This project">
              <a href="#/files">What Ola has of yours</a>
              <a href="#/data">Data</a>
              <a href="#/jobs">Jobs</a>
              <a href="#/settings">Settings</a>
              <Show when={props.me.person.admin}>
                <a href="#/quality">Quality</a>
              </Show>
              <Show when={canRun()}>
                <button type="button" class="link-button on-room" onClick={addFiles}>
                  <Icon name="plus" size={16} /> Add files
                </button>
              </Show>
            </nav>
            {/* On a phone the page is one of three: the conversation, what Ola made, its sources. */}
            <Show when={project() && isNarrow()}>
              <div class="tabs" role="tablist" aria-label="Show">
                <Show when={canRun()}>
                  <button type="button" role="tab" class="tab" aria-selected={tab() === 'talk'} onClick={() => showTab('talk')}>
                    Conversation
                  </button>
                </Show>
                <button type="button" role="tab" class="tab" aria-selected={tab() === 'made'} onClick={() => showTab('made')}>
                  Made by Ola <span class="tab-count">{madeThings().length}</span>
                </button>
                <Show when={sources().length}>
                  <button type="button" role="tab" class="tab" aria-selected={tab() === 'sources'} onClick={() => showTab('sources')}>
                    Sources <span class="tab-count">{sources().length}</span>
                  </button>
                </Show>
              </div>
            </Show>
          </section>
          <Show when={project()} fallback={<p class="loading" role="status">{waking() ? 'Waking your project. This takes a few seconds…' : 'Opening your project…'}</p>}>
            <Show when={madeThings().length || sources().length || project()!.files?.length} fallback={<EmptyProject canRun={canRun()} onAsk={openDrawer} onAddFiles={addFiles} />}>
              <div class="made" classList={{ 'tab-hidden': isNarrow() && tab() !== 'made' }}>
                {/* What Ola made, by kind: pages, charts and images, tables, documents. */}
                <For each={groupThings(madeThings())}>
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
                <Show when={!madeThings().length}>
                  <p class="made-none">Ola has not made anything in this project yet. Ask for something and it shows up here.</p>
                </Show>
                <Show when={project()!.files?.length}>
                  <OtherFiles files={project()!.files!} total={project()!.otherTotal ?? project()!.files!.length} hasThings={!!project()!.things.length} />
                </Show>
              </div>
              <Show when={sources().length}>
                <div classList={{ 'tab-hidden': isNarrow() && tab() !== 'sources' }}>
                  <Sources sources={sources()} />
                </div>
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
          <button type="button" class="askbar-open" onClick={() => openDrawer()} aria-expanded={drawer()} aria-controls="ask-drawer" aria-label="Ask Ola">
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
              <button type="button" class="link-button on-room" onClick={() => openDrawer()}>
                Open the drawer
              </button>
            </p>
          </Show>
      </div>

      <Drawer ola={ola} open={drawer()} onClose={closeDrawer} onAddFiles={addFiles} onFiles={showFiles} draft={draft()} setDraft={setDraft} inputRef={(el) => (drawerInput = el)} />
      <ApprovalSheet ola={ola} provider={props.me.policy.searchProvider} />

 <dialog ref={menuDialog} class="sheet menu-sheet" aria-labelledby="menu-title" onClose={() => setMenu(false)} onClick={(e) => e.target === menuDialog && setMenu(false)}>
        <div class="sheet-inner">
          <div class="menu-head">
            <h2 id="menu-title" class="sheet-title">
              {p()?.name ?? 'Your project'}
            </h2>
            <button type="button" class="ghost-button small on-paper" onClick={() => setMenu(false)}>
              <Icon name="close" size={16} /> Close
            </button>
          </div>
          <ul class="menu-list">
            <Show when={canRun()}>
              <li>
                <button type="button" class="menu-item" onClick={() => (setMenu(false), addFiles())}>
                  <Icon name="plus" size={20} />
                  <span>
                    <span class="menu-name">Add files</span>
                    <span class="menu-what">Give Ola a spreadsheet, a PDF or a document to work with</span>
                  </span>
                </button>
              </li>
            </Show>
            <li>
              <a class="menu-item" href="#/files" onClick={(e) => (e.preventDefault(), go('#/files'))}>
                <Icon name="eye" size={20} />
                <span>
                  <span class="menu-name">What Ola has of yours</span>
                  <span class="menu-what">Every file in this project, and what Ola can read</span>
                </span>
              </a>
            </li>
            <li>
              <a class="menu-item" href="#/data" onClick={(e) => (e.preventDefault(), go('#/data'))}>
                <Icon name="table" size={20} />
                <span>
                  <span class="menu-name">Data</span>
                  <span class="menu-what">The tables and documents Ola keeps for this project</span>
                </span>
              </a>
            </li>
            <li>
              <a class="menu-item" href="#/jobs" onClick={(e) => (e.preventDefault(), go('#/jobs'))}>
                <Icon name="run" size={20} />
                <span>
                  <span class="menu-name">Jobs</span>
                  <span class="menu-what">Long work over many documents, started by you</span>
                </span>
              </a>
            </li>
            <li>
              <a class="menu-item" href="#/settings" onClick={(e) => (e.preventDefault(), go('#/settings'))}>
                <Icon name="settings" size={20} />
                <span>
                  <span class="menu-name">Settings</span>
                  <span class="menu-what">How Ola works in this project</span>
                </span>
              </a>
            </li>
            <Show when={props.me.person.admin}>
              <li>
                <a class="menu-item" href="#/quality" onClick={(e) => (e.preventDefault(), go('#/quality'))}>
                  <Icon name="check" size={20} />
                  <span>
                    <span class="menu-name">Quality</span>
                    <span class="menu-what">How Ola did against Claude, for you as admin</span>
                  </span>
                </a>
              </li>
            </Show>
            <li>
              <button type="button" class="menu-item" onClick={() => (setMenu(false), setPromise(true))}>
                <Icon name="machine" size={20} />
                <span>
                  <span class="menu-name">On this machine</span>
                  <span class="menu-what">Where your files are, and what never leaves</span>
                </span>
              </button>
            </li>
          </ul>
          <ul class="menu-list menu-you">
            <li>
              <a class="menu-item" href="/#/projects">
                <Icon name="back" size={20} />
                <span>
                  <span class="menu-name">Your projects</span>
                  <span class="menu-what">{props.me.workspaces.length > 1 ? `All ${count(props.me.workspaces.length, 'project')} you can open` : 'The list of your projects'}</span>
                </span>
              </a>
            </li>
            <li>
              <a class="menu-item" href="/#/account">
                <Icon name="settings" size={20} />
                <span>
                  <span class="menu-name">Your account</span>
                  <span class="menu-what">Password, passkeys and your computers</span>
                </span>
              </a>
            </li>
            <li>
              <button type="button" class="menu-item" onClick={props.onSignOut}>
                <Icon name="close" size={20} />
                <span>
                  <span class="menu-name">Sign out</span>
                  <span class="menu-what">Signed in as {props.me.person.name}</span>
                </span>
              </button>
            </li>
          </ul>
        </div>
      </dialog>

      <dialog ref={promiseDialog} class="sheet promise" aria-labelledby="promise-title" onClose={() => setPromise(false)}>
        <div class="sheet-inner">
          <h2 id="promise-title" class="sheet-title">
            On this machine
          </h2>
          <p class="sheet-lede">Everything you do here runs on one Mac that Bart owns, in his office. The model that reads your files runs on it too.</p>
          <Show when={machine()}>
            {(m) => (
              <p class="machine-now">
                Right now {m().working === 1 ? 'one person is' : `${count(m().working, 'person', 'people')} are`} using it, of the {m().capacity} it can take at once. It never says who.
              </p>
            )}
          </Show>
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
