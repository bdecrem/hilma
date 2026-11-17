// Signing in the Mac app or the command line ("On this Mac": the agent on the person's own
// computer, only the model and web search on this machine; frontdesk/devices.mjs).
//
// The app opens #/device?challenge=…&port=…&name=…&kind=mac|cli (in the fragment, so in no request
// line). Signed in, the person sees "Sign in to Ola on <name>?"; on yes the page asks for a one-time
// code and sends the browser to http://127.0.0.1:<port>/?code=<code>, where the app is listening.
// Cancel sends ?error=cancelled there instead, so the app stops waiting. Everything in the request
// is checked here and again by the front desk; the name is shown as text, never as HTML.
//
// Below it, YourDevices: the person's signed-in computers, each with Remove (Settings and the
// projects page).
import { createResource, createSignal, For, Show } from 'solid-js'
import { DeskError, devicesApi } from '../lib/api.ts'
import type { Device, Me, Problem } from '../lib/types.ts'
import { when } from '../lib/format.ts'

export interface DeviceRequest {
  challenge: string
  port: number
  name: string
  kind: 'mac' | 'cli'
}

/** The request in #/device?…, or 'bad' when it is there but not whole, or null when absent. */
export function deviceRequestOf(hash: string): DeviceRequest | 'bad' | null {
  if (!/^#\/device(\?|$)/.test(hash)) return null
  const q = new URLSearchParams(hash.split('?')[1] ?? '')
  const challenge = q.get('challenge') ?? ''
  const portText = q.get('port') ?? ''
  const name = (q.get('name') ?? '').trim()
  const kind = q.get('kind')
  const port = /^[0-9]{4,5}$/.test(portText) ? Number(portText) : NaN
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || !(port >= 1024 && port <= 65535) || !name || [...name].length > 60 || /\p{C}/u.test(name) || (kind !== 'mac' && kind !== 'cli')) return 'bad'
  return { challenge, port, name, kind }
}

const KIND_WORDS = { mac: 'The Ola app for Mac', cli: 'Ola on the command line' }
/** "today at 9:12 pm", "on Nov 3". */
const at = (iso: string) => (when(iso).includes(':') ? `today at ${when(iso)}` : `on ${when(iso)}`)

export function DeviceSignIn(props: { request: DeviceRequest | 'bad'; me: Me; onDone: () => void }) {
  const [problem, setProblem] = createSignal<Problem | null>(null)
  const [state, setState] = createSignal<'ask' | 'busy' | 'handed' | 'cancelled'>('ask')
  const r = () => (props.request === 'bad' ? null : props.request)
  const allowed = () => !!props.me.devices?.allowed
  const back = (to: string) => {
    // The request leaves the address before the browser goes on, so Back does not offer it again.
    history.replaceState(null, '', `${location.pathname}${location.search}#/`)
    location.assign(to)
  }

  const yes = async () => {
    const q = r()
    if (!q || state() !== 'ask') return
    setProblem(null)
    setState('busy')
    try {
      const { code } = await devicesApi.grant({ challenge: q.challenge, name: q.name, kind: q.kind, port: q.port })
      setState('handed')
      back(`http://127.0.0.1:${q.port}/?code=${encodeURIComponent(code)}`)
    } catch (e) {
      setState('ask')
      setProblem(e instanceof DeskError ? e.problem : { text: 'Ola’s computer did not answer. Nothing was signed in. Try again.', detail: String(e) })
    }
  }
  const no = () => {
    const q = r()
    setState('cancelled')
    if (q) back(`http://127.0.0.1:${q.port}/?error=cancelled`)
    else props.onDone()
  }

  return (
    <div class="device-ask" aria-labelledby="device-title">
      <Show
        when={r()}
        fallback={
          <>
            <h1 id="device-title" class="gate-title">
              This sign-in link is not complete
            </h1>
            <p class="gate-lede">Start again from Ola on that computer. Nothing was signed in.</p>
            <button type="button" class="ghost-button on-room" onClick={props.onDone}>
              Back to your projects
            </button>
          </>
        }
      >
        {(q) => (
          <>
            <h1 id="device-title" class="gate-title device-title">
              Sign in to Ola on <span class="device-name">{q().name}</span>?
            </h1>
            <div class="device-card">
              <span class="device-glyph" aria-hidden="true" data-kind={q().kind} />
              <div>
                <p class="device-card-name">{q().name}</p>
                <p class="device-card-meta">
                  {KIND_WORDS[q().kind]} · as {props.me.person.name}
                </p>
              </div>
            </div>
            <p class="device-warn">Only continue if you just asked Ola on that computer to sign in.</p>
            <Show when={problem()}>{(p) => <GateProblem problem={p()} />}</Show>
            <Show
              when={allowed()}
              fallback={
                <>
                  <GateProblem problem={{ text: 'Your account cannot sign in to Ola on other computers yet. Ask Bart if you need it.', detail: null }} />
                  <div class="device-actions">
                    <button type="button" class="ghost-button on-room" onClick={no}>
                      Cancel
                    </button>
                  </div>
                </>
              }
            >
              <div class="device-actions">
                <button type="button" class="paper-button" onClick={() => void yes()} disabled={state() !== 'ask'}>
                  {state() === 'busy' || state() === 'handed' ? 'Signing in…' : 'Sign in'}
                </button>
                <button type="button" class="ghost-button on-room" onClick={no} disabled={state() !== 'ask'}>
                  Cancel
                </button>
              </div>
            </Show>
            <p class="gate-how">
              That computer can then use Ola’s model and web search under your name, for 180 days or until you remove it in Settings. It cannot open your projects here.
            </p>
          </>
        )}
      </Show>
    </div>
  )
}

function GateProblem(props: { problem: Problem }) {
  return (
    <div class="gate-problem" role="alert">
      <span class="mark-dot" aria-hidden="true" />
      <p>{props.problem.text}</p>
    </div>
  )
}

/** The person's signed-in computers, each with Remove. `tone` is the surface it sits on. */
export function YourDevices(props: { tone: 'room' | 'paper' }) {
  const [list, { refetch }] = createResource(() => devicesApi.list())
  const [busy, setBusy] = createSignal<number | null>(null)
  const [problem, setProblem] = createSignal<Problem | null>(null)
  const remove = async (d: Device) => {
    setBusy(d.id)
    setProblem(null)
    try {
      await devicesApi.remove(d.id)
      await refetch()
    } catch (e) {
      setProblem(e instanceof DeskError ? e.problem : { text: 'Ola’s computer did not answer. Nothing was changed.', detail: String(e) })
    } finally {
      setBusy(null)
    }
  }
  return (
    <section class="your-devices setting" classList={{ 'on-room': props.tone === 'room' }} aria-labelledby="devices-title">
      <div class="setting-row">
        <div class="setting-text">
          <h2 class="setting-name" id="devices-title">
            Your devices
          </h2>
          <p class="setting-say">The Ola app for Mac and Ola on the command line, signed in to your account. Remove one and it is signed out at once.</p>
        </div>
      </div>
      <Show when={problem()}>{(p) => <p class="devices-problem" role="alert">{p().text}</p>}</Show>
      <Show when={list()} fallback={<p class="devices-none" role="status">{list.error ? 'Not known just now.' : 'Loading…'}</p>}>
        {(l) => (
          <Show when={l().devices.length} fallback={<p class="devices-none">None yet. Sign in from the Ola app on your Mac, or from the command line, and it shows here.</p>}>
            <ul class="devices-list">
              <For each={l().devices}>
                {(d) => (
                  <li class="device-row">
                    <span class="device-glyph small" aria-hidden="true" data-kind={d.kind} />
                    <div class="device-row-text">
                      <span class="device-row-name">{d.name}</span>
                      <span class="device-row-meta">
                        {KIND_WORDS[d.kind]} · signed in {at(d.created)}
                        {d.lastUsed ? ` · last used ${at(d.lastUsed)}` : ''}
                      </span>
                    </div>
                    <button type="button" class="ghost-button" classList={{ 'on-room': props.tone === 'room', 'on-paper': props.tone === 'paper' }} disabled={busy() !== null} onClick={() => void remove(d)} aria-label={`Remove ${d.name}`}>
                      {busy() === d.id ? 'Removing…' : 'Remove'}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        )}
      </Show>
    </section>
  )
}
