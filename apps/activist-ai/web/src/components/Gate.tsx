// The way in: who is signed in decides what this tab shows.
//   - signed out: the sign-in screen (look A, after the mock in 7-letter-and-desk/b2: the room,
//     the brushed "Ola," greeting, the study at night), or, from an invitation link
//     (#/invite/<token>), the same screen making a passkey.
//   - signed in, no workspace in the address: the person's projects (one opens directly).
//   - signed in, a workspace in the address that is theirs: the app.
// Passkeys only: no password, no email. WebAuthn options are fetched before the button is
// pressed, so the browser's passkey prompt runs straight from the click (Safari requires that).
import { createResource, createSignal, For, Match, onCleanup, Show, Switch } from 'solid-js'
import { desk, DeskError, passkeys, setCsrf, workspace } from '../lib/api.ts'
import type { Me, Problem } from '../lib/types.ts'
import { App } from '../App.tsx'

const inviteOf = () => /^#\/invite\/([A-Za-z0-9_-]{20,100})$/.exec(location.hash)?.[1] ?? null

export function Gate() {
  const [me, { refetch }] = createResource(async (): Promise<Me | null> => {
    try {
      const m = await desk.me()
      setCsrf(m.csrf)
      // One project and none named in the address: open it, in place (no reload).
      if (!workspace() && m.workspaces.length === 1) history.replaceState(null, '', `?w=${encodeURIComponent(m.workspaces[0].slug)}${location.hash || '#/'}`)
      return m
    } catch (e) {
      if (e instanceof DeskError && e.status === 401) return null
      throw e
    }
  })
  const signedIn = async () => {
    // A fresh session: drop the invitation from the address, then load who we are.
    if (inviteOf()) history.replaceState(null, '', `${location.pathname}${location.search}#/`)
    await refetch()
  }
  const signOut = async () => {
    try {
      await desk.signOut()
    } finally {
      location.replace('/')
    }
  }
  const onSignedOut = () => me() && void refetch()
  window.addEventListener('ola:signed-out', onSignedOut)
  onCleanup(() => window.removeEventListener('ola:signed-out', onSignedOut))
  const current = () => me()?.workspaces.find((w) => w.slug === workspace())

  return (
    <Switch fallback={<Room><p class="gate-lede">Opening…</p></Room>}>
      <Match when={me.error}>
        <Room>
          <GateProblem problem={me.error instanceof DeskError ? me.error.problem : { text: 'Ola’s computer did not answer. Check your connection and reload.', detail: String(me.error) }} />
        </Room>
      </Match>
      <Match when={me() === null}>
        <SignIn invite={inviteOf()} onSignedIn={signedIn} />
      </Match>
      <Match when={me() && current()}>
        <App me={me()!} role={current()!.role} onSignOut={signOut} />
      </Match>
      <Match when={me()}>
        <Projects me={me()!} unknown={!!workspace()} onSignOut={signOut} />
      </Match>
    </Switch>
  )
}

function Room(props: { children: any; wide?: boolean }) {
  return (
    <div class="gate">
      <main class="gate-main" classList={{ wide: props.wide }} id="main">
        {props.children}
      </main>
      <footer class="gate-foot">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        <span>A private AI agent for activists and academics.</span>
      </footer>
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

function SignIn(props: { invite: string | null; onSignedIn: () => void }) {
  const [problem, setProblem] = createSignal<Problem | null>(null)
  const [busy, setBusy] = createSignal(false)
  // The ceremony is prepared ahead and refreshed before the server's five minutes run out.
  const [prepared, { refetch }] = createResource(async () => {
    try {
      return props.invite ? await passkeys.prepareRegister(props.invite) : await passkeys.prepareSignIn()
    } catch (e) {
      setProblem(e instanceof DeskError ? e.problem : { text: 'Ola’s computer did not answer. Reload to try again.', detail: String(e) })
      return null
    }
  })
  const timer = setInterval(() => !busy() && void refetch(), 4 * 60_000)
  onCleanup(() => clearInterval(timer))

  const go = async () => {
    const p = prepared()
    if (!p || busy()) return
    setProblem(null)
    setBusy(true)
    try {
      await (props.invite ? passkeys.finishRegister(p) : passkeys.finishSignIn(p))
      props.onSignedIn()
    } catch (e) {
      setProblem(e instanceof DeskError ? e.problem : { text: 'Your passkey could not be used just now.', detail: String(e) })
      void refetch() // a ceremony is good once, right or wrong
    } finally {
      setBusy(false)
    }
  }
  // "Ola, Maria.": the greeting ends the sentence, so a name that ends in a period keeps just one.
  const name = () => ((prepared() as any)?.name as string | undefined)?.replace(/\.+$/, '')

  return (
    <Room wide>
      <div class="gate-grid">
        <section class="gate-letter" aria-labelledby="gate-title">
          <h1 id="gate-title" class="gate-hello">
            <img class="gate-word" src="/wordmark.svg" alt="Ola," width="215" height="125" />
            <Show when={props.invite && name()}>
              <span class="gate-name">{name()}.</span>
            </Show>
          </h1>
          <p class="gate-lede">{props.invite ? 'Bart invited you to the computer in his office. Make a passkey on this device, and you are in.' : 'Sign in to the computer in Bart’s office.'}</p>
          <Show when={problem()}>{(p) => <GateProblem problem={p()} />}</Show>
          <button type="button" class="paper-button" onClick={go} disabled={busy() || !prepared()} aria-describedby="gate-how">
            {busy() ? 'Waiting for your passkey…' : props.invite ? 'Make my passkey' : 'Sign in with your passkey'}
          </button>
          <p id="gate-how" class="gate-how">
            {props.invite
              ? 'A passkey stays on this device, behind Face ID, Touch ID, Windows Hello or your device’s PIN. There is no password to remember, and this link works once.'
              : 'Your passkey is on the device you set it up on: Face ID, Touch ID, Windows Hello or your phone. No passkey yet? Ask Bart for an invitation.'}
          </p>
        </section>
        <figure class="gate-art">
          <img src="/desk.svg" alt="The study at night: a desk with Ola’s computer under a lamp, a plant, books, and a window over the rooftops." />
          <figcaption>Our datacenter.</figcaption>
        </figure>
      </div>
    </Room>
  )
}

function Projects(props: { me: Me; unknown: boolean; onSignOut: () => void }) {
  const roleWords = { owner: 'You run this project', member: 'You work in this project', viewer: 'You can read this project' }
  return (
    <Room>
      <div class="gate-head">
        <h1 class="gate-title">Your projects, {props.me.person.name}</h1>
        <button type="button" class="ghost-button on-room" onClick={props.onSignOut}>
          Sign out
        </button>
      </div>
      <Show when={props.unknown}>
        <GateProblem problem={{ text: 'That project is not one of yours, or it is closed. Here are the ones you can open.', detail: null }} />
      </Show>
      <Show when={props.me.workspaces.length} fallback={<p class="gate-lede">You are signed in, but no project is shared with you yet. Bart will add you to one.</p>}>
        <ul class="gate-projects">
          <For each={props.me.workspaces}>
            {(w) => (
              <li>
                <a class="gate-project" href={`?w=${encodeURIComponent(w.slug)}#/`}>
                  <span class="gate-project-name">{w.name}</span>
                  <span class="gate-project-meta">
                    {w.team} · {roleWords[w.role]}
                  </span>
                </a>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </Room>
  )
}
