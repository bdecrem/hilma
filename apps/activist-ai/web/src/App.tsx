// The app: a project opens on its things; "Ask Ola" is a bar at the bottom that opens into a
// drawer with the conversation; "What Ola has of yours" is one click from the header.
// Routes are hash routes (#/ and #/files) so the front desk serves one page for every path.
import type { Me, Role } from './lib/types.ts'
import { createEffect, createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { desk, DeskError } from './lib/api.ts'
import { createOla } from './lib/ola.ts'
import { count, people } from './lib/format.ts'
import { Icon, Wordmark } from './components/Icon.tsx'
import { EmptyProject, OtherFiles, ThingCard } from './components/Things.tsx'
import { Drawer, ProblemBox } from './components/Drawer.tsx'
import { FilesView } from './components/FilesView.tsx'
import { ApprovalSheet } from './components/ApprovalSheet.tsx'

type Route = 'home' | 'files'
const routeOf = (hash: string): Route => (hash.startsWith('#/files') ? 'files' : 'home')
/** `#/?ask=<conversation id>` opens the drawer on that conversation. */
const askOf = (hash: string): string | null => new URLSearchParams(hash.split('?')[1] ?? '').get('ask')
/** `?still` in the address: no live stream (screenshots, printing). */
const STILL = new URLSearchParams(location.search).has('still')

export function App(props: { me: Me; role: Role; onSignOut: () => void }) {
  const canRun = () => props.role !== 'viewer'
  const [route, setRoute] = createSignal<Route>(routeOf(location.hash))
  const onHash = () => setRoute(routeOf(location.hash))
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
  let promiseDialog: HTMLDialogElement | undefined

  const openDrawer = () => {
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
    if (prev && prev !== r) queueMicrotask(() => (r === 'files' ? document.getElementById('files-title') : heading)?.focus())
    return r
  })
  createEffect(() => {
    const p = project()?.project
    document.title = p ? `${route() === 'files' ? 'What Ola has of yours · ' : ''}${p.name} · Ola` : 'Ola'
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

  const sendFromBar = (e: Event) => {
    e.preventDefault()
    const text = draft().trim()
    openDrawer()
    if (!text || working() || ola.state.connection === 'lost') return
    setDraft('')
    void ola.send(text)
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
            <Show when={route() === 'files'} fallback={<span class="crumb-muted">{p()!.group}</span>}>
              <a href="#/">{p()!.name}</a>
            </Show>
            <span class="crumb-sep" aria-hidden="true">
              /
            </span>
            <span class="crumb-here" aria-current="page">
              {route() === 'files' ? 'What Ola has of yours' : p()!.name}
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
                <Icon name="back" size={16} /> Back to {project() ? count(project()!.things.length, 'thing') : 'the things'}
              </a>
              <FilesView onChanged={() => void refetch()} uploadRef={(el) => (uploadButton = el)} canWrite={canRun()} deleteNotice={props.me.policy.deleteNotice} />
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
              <Show when={canRun()}>
                <button type="button" class="ghost-button on-room" onClick={addFiles}>
                  <Icon name="plus" size={18} /> Add files
                </button>
              </Show>
            </div>
          </section>
          <Show when={project()} fallback={<p class="loading" role="status">{waking() ? 'Waking your workspace…' : 'Opening your project…'}</p>}>
            <Show when={project()!.things.length || project()!.files?.length} fallback={<EmptyProject canRun={canRun()} onAsk={openDrawer} onAddFiles={addFiles} />}>
              <Show when={project()!.things.length}>
                <div class="things" role="list" aria-label="Your things">
                  <For each={project()!.things}>
                    {(t) => (
                      <div role="listitem" class="thing-slot" data-kind={t.kind}>
                        <ThingCard thing={t} />
                      </div>
                    )}
                  </For>
                </div>
              </Show>
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
      <div class="askdock" classList={{ hidden: drawer() || !canRun() }}>
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

      <Drawer ola={ola} open={drawer()} onClose={closeDrawer} onAddFiles={addFiles} draft={draft()} setDraft={setDraft} inputRef={(el) => (drawerInput = el)} />
      <ApprovalSheet ola={ola} />

      <dialog ref={promiseDialog} class="sheet promise" aria-labelledby="promise-title" onClose={() => setPromise(false)}>
        <div class="sheet-inner">
          <h2 id="promise-title" class="sheet-title">
            On this machine
          </h2>
          <p class="sheet-lede">Everything you do here runs on one Mac that Bart owns, in his office. The model that reads your files runs on it too.</p>
          <ul class="promise-list">
            <li>Your files and requests are not sent to any AI company or cloud service.</li>
            <li>Ola can read only the files you upload, listed under “What Ola has of yours”.</li>
            <li>Your conversations stay in your project until you delete them. Bart, who runs the machine, could read a session while it runs; he does not keep logs of what you ask.</li>
            <li>Anything that would leave the machine, like a web search, is off unless you turn it on, and asks first.</li>
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
