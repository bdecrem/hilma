// The way in: who is signed in decides what this tab shows.
//   - signed out: the sign-in screen (look A, after the mock in 7-letter-and-desk/b2: the room,
//     the brushed "Ola," greeting, the study at night): a name and a password, or a passkey;
//     from an invitation link (#/invite/<token>), the same screen choosing a password (or making a
//     passkey); from the admin's link (#/reset/<token>), choosing a new password.
//   - #/device?…: the Ola app on a Mac asks to sign in; signed in, the person says yes or not now.
//   - #/account: the person's own account (password, passkeys, the switch, their Macs).
//   - signed in, no workspace in the address: the person's projects (one opens directly, unless the
//     address is #/projects: "Your projects" in a project always shows the list; admins make one there).
//   - signed in, a workspace in the address that is theirs: the app.
// WebAuthn options are fetched before the button is pressed, so the browser's passkey prompt runs
// straight from the click (Safari requires that); the passkey after a right password is its own click.
import { createResource, createSignal, For, Match, onCleanup, Show, Switch } from 'solid-js'
import { account, desk, DeskError, passkeys, setCsrf, setMaxUpload, workspace, type AccountInfo, type Prepared } from '../lib/api.ts'
import type { Me, Problem } from '../lib/types.ts'
import { App } from '../App.tsx'
import { DeviceSignIn, deviceRequestOf, YourDevices } from './Device.tsx'

const inviteOf = () => /^#\/invite\/([A-Za-z0-9_-]{20,100})$/.exec(location.hash)?.[1] ?? null
const resetOf = () => /^#\/reset\/([A-Za-z0-9_-]{20,100})$/.exec(location.hash)?.[1] ?? null
const accountOf = () => location.hash === '#/account'
const day = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', d.getFullYear() === new Date().getFullYear() ? { month: 'long', day: 'numeric' } : { month: 'long', day: 'numeric', year: 'numeric' })
}
const problemOf = (e: unknown, fallback: string): Problem => (e instanceof DeskError ? e.problem : { text: fallback, detail: String(e) })

export function Gate() {
  const [hash, setHash] = createSignal(location.hash)
  const onHash = () => setHash(location.hash)
  window.addEventListener('hashchange', onHash)
  onCleanup(() => window.removeEventListener('hashchange', onHash))
  const [me, { refetch }] = createResource(async (): Promise<Me | null> => {
    try {
      const m = await desk.me()
      setCsrf(m.csrf)
      setMaxUpload(m.policy?.maxUpload)
      // One project and none named in the address: open it, in place (no reload).
      if (!workspace() && m.workspaces.length === 1 && !deviceRequestOf(location.hash) && !accountOf() && location.hash !== '#/projects') history.replaceState(null, '', `?w=${encodeURIComponent(m.workspaces[0].slug)}${location.hash || '#/'}`)
      return m
    } catch (e) {
      if (e instanceof DeskError && e.status === 401) return null
      throw e
    }
  })
  const signedIn = async () => {
    // A fresh session: drop the invitation or link from the address, then load who we are.
    if (inviteOf() || resetOf()) history.replaceState(null, '', `${location.pathname}${location.search}#/`)
    setHash(location.hash)
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
  // An app on another computer asking to sign in (#/device?…): after the person's own sign-in (Device.tsx).
  const deviceAsk = () => (hash(), deviceRequestOf(location.hash))

  return (
    <Switch fallback={<Room><p class="gate-lede">Opening…</p></Room>}>
      <Match when={(hash(), resetOf())}>
        <ResetPassword token={resetOf()!} onSignedIn={signedIn} />
      </Match>
      <Match when={me.error}>
        <Room>
          <GateProblem problem={me.error instanceof DeskError ? me.error.problem : { text: 'Ola’s computer did not answer. Check your connection and reload.', detail: String(me.error) }} />
        </Room>
      </Match>
      <Match when={me() === null}>
        <SignIn invite={inviteOf()} device={deviceAsk()} onSignedIn={signedIn} />
      </Match>
      <Match when={me() && deviceAsk()}>
        <Room>
          <DeviceSignIn request={deviceAsk()!} me={me()!} onDone={() => (location.hash = '#/')} />
        </Room>
      </Match>
      <Match when={me() && hash() === '#/account'}>
        <AccountView me={me()!} onSignOut={signOut} />
      </Match>
      <Match when={me() && current()}>
        <Notices notices={me()!.notices} />
        <App me={me()!} role={current()!.role} onSignOut={signOut} />
      </Match>
      <Match when={me()}>
        <Notices notices={me()!.notices} />
        <Projects me={me()!} unknown={!!workspace()} onSignOut={signOut} />
      </Match>
    </Switch>
  )
}

/** What the front desk says the person must hear once (a passkey added for another device). */
function Notices(props: { notices?: Me['notices'] }) {
  const [shown, setShown] = createSignal(props.notices ?? [])
  return (
    <Show when={shown().length}>
      <div class="notice-bar" role="alert">
        <For each={shown()}>{(n) => <p>{n.text}</p>}</For>
        <button type="button" class="ghost-button" onClick={() => setShown([])}>
          I have read this
        </button>
      </div>
    </Show>
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

/** The letter on the left and the study on the right: every screen before the app. */
function Letter(props: { name?: string; children: any }) {
  return (
    <Room wide>
      <div class="gate-grid">
        <section class="gate-letter" aria-labelledby="gate-title">
          <h1 id="gate-title" class="gate-hello">
            <img class="gate-word" src="/wordmark.svg" alt="Ola," width="215" height="125" />
            <Show when={props.name}>
              <span class="gate-name">{props.name}.</span>
            </Show>
          </h1>
          {props.children}
        </section>
        <figure class="gate-art">
          <img src="/desk.svg" alt="The study at night: a desk with Ola’s computer under a lamp, a plant, books, and a window over the rooftops." />
          <figcaption>Our datacenter.</figcaption>
        </figure>
      </div>
    </Room>
  )
}

/** A password field with a Show button (no "type it twice": the person can look instead). */
function PasswordField(props: { label: string; value: string; onInput: (v: string) => void; autocomplete: 'current-password' | 'new-password'; id: string; hint?: string; paper?: boolean }) {
  const [shown, setShown] = createSignal(false)
  return (
    <div class="gate-field" classList={{ 'on-paper': props.paper }}>
      <label for={props.id}>{props.label}</label>
      <div class="gate-input-row">
        <input id={props.id} type={shown() ? 'text' : 'password'} autocomplete={props.autocomplete} autocapitalize="none" spellcheck={false} value={props.value} onInput={(e) => props.onInput(e.currentTarget.value)} aria-describedby={props.hint ? `${props.id}-hint` : undefined} />
        <button type="button" class="gate-show" aria-pressed={shown()} aria-controls={props.id} onClick={() => setShown(!shown())}>
          {shown() ? 'Hide' : 'Show'}
        </button>
      </div>
      <Show when={props.hint}>
        <p id={`${props.id}-hint`} class="gate-hint">
          {props.hint}
        </p>
      </Show>
    </div>
  )
}

/** Checks that the browser kept the session cookie; says so plainly if it did not. */
async function cookieKept(setProblem: (p: Problem) => void): Promise<boolean> {
  try {
    await desk.me()
    return true
  } catch (e) {
    if (e instanceof DeskError && e.status === 401) {
      setProblem({ text: 'Ola let you in, but this browser did not keep the sign-in: the next page arrived signed out. Private windows and blocked cookies do this. Try again in a normal window, or tell Bart.', detail: 'signed in, then 401 from /api/me: the session cookie was not stored or not sent' })
      return false
    }
    return true
  }
}

function SignIn(props: { invite: string | null; device?: ReturnType<typeof deviceRequestOf>; onSignedIn: () => void }) {
  const [problem, setProblem] = createSignal<Problem | null>(null)
  const [busy, setBusy] = createSignal(false)
  const [handle, setHandle] = createSignal('')
  const [password, setPassword] = createSignal('')
  // After a right password, for a person who asks for their passkey too: their passkey, by a click.
  const [step, setStep] = createSignal<Prepared | null>(null)
  // The ceremony is prepared ahead and refreshed before the server's five minutes run out.
  const [prepared, { refetch }] = createResource(async () => {
    try {
      return props.invite ? await passkeys.prepareRegister(props.invite) : await passkeys.prepareSignIn()
    } catch (e) {
      setProblem(problemOf(e, 'Ola’s computer did not answer. Reload to try again.'))
      return null
    }
  })
  const timer = setInterval(() => !busy() && void refetch(), 4 * 60_000)
  onCleanup(() => clearInterval(timer))

  const finish = async () => {
    if (!(await cookieKept(setProblem))) return
    props.onSignedIn()
  }
  const withPasskey = async (p: Prepared | null | undefined, register: boolean) => {
    if (!p || busy()) return
    setProblem(null)
    setBusy(true)
    try {
      await (register ? passkeys.finishRegister(p) : passkeys.finishSignIn(p))
      setStep(null)
      await finish()
    } catch (e) {
      setProblem(problemOf(e, 'Your passkey could not be used just now.'))
      if (!register || props.invite) void refetch() // a ceremony is good once, right or wrong
      setStep(null)
    } finally {
      setBusy(false)
    }
  }
  const submit = async (e: Event) => {
    e.preventDefault()
    if (busy()) return
    setProblem(null)
    if (!props.invite && !handle().trim()) return setProblem({ text: 'Type your name for Ola.', detail: null })
    if (!password()) return setProblem({ text: props.invite ? 'Choose a password.' : 'Type your password.', detail: null })
    setBusy(true)
    try {
      if (props.invite) {
        await account.invitePassword(props.invite, password())
        await finish()
      } else {
        const next = await account.signIn(handle().trim(), password())
        if (next) setStep(next)
        else await finish()
      }
    } catch (e) {
      setProblem(problemOf(e, 'Ola’s computer did not answer. Check your connection and try again.'))
    } finally {
      setBusy(false)
    }
  }
  // "Ola, Maria.": the greeting ends the sentence, so a name that ends in a period keeps just one.
  const name = () => ((prepared() as any)?.name as string | undefined)?.replace(/\.+$/, '')
  const inviteHandle = () => (prepared() as any)?.options?.user?.name as string | undefined
  const min = () => ((prepared() as any)?.min as number | undefined) ?? 15

  return (
    <Letter name={props.invite ? name() : undefined}>
      <p class="gate-lede">
        {props.invite ? 'Bart invited you to the computer in his office. Choose a password, and you are in.' : props.device && props.device !== 'bad' ? `Sign in here first. Then you can let Ola on ${props.device.name} in.` : 'Sign in to the computer in Bart’s office.'}
      </p>
      <Show when={problem()}>{(p) => <GateProblem problem={p()} />}</Show>
      <Show
        when={!step()}
        fallback={
          <div class="gate-step">
            <p class="gate-how">Your account asks for your passkey too. Use it now to finish signing in.</p>
            <button type="button" class="paper-button" onClick={() => withPasskey(step(), false)} disabled={busy()}>
              {busy() ? 'Waiting for your passkey…' : 'Use my passkey'}
            </button>
          </div>
        }
      >
        <form class="gate-form" onSubmit={submit} novalidate>
          <Show
            when={!props.invite}
            fallback={
              // For password managers: the name this password goes with.
              <input type="text" name="username" autocomplete="username" value={inviteHandle() ?? ''} hidden readOnly />
            }
          >
            <div class="gate-field">
              <label for="gate-handle">Your name for Ola</label>
              <input id="gate-handle" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck={false} value={handle()} onInput={(e) => setHandle(e.currentTarget.value)} />
            </div>
          </Show>
          <PasswordField
            id="gate-password"
            label={props.invite ? 'Choose a password' : 'Password'}
            autocomplete={props.invite ? 'new-password' : 'current-password'}
            value={password()}
            onInput={setPassword}
            hint={props.invite ? `At least ${min()} characters. A few words in a row works well.${inviteHandle() ? ` You sign in as ${inviteHandle()}.` : ''}` : undefined}
          />
          <button type="submit" class="paper-button" disabled={busy()}>
            {busy() ? (props.invite ? 'Making your account…' : 'Signing in…') : props.invite ? 'Make my account' : 'Sign in'}
          </button>
        </form>
        <div class="gate-or">
          <span class="gate-or-word">{props.invite ? 'Or use a passkey instead' : 'Or'}</span>
          <button type="button" class="ghost-button on-room" onClick={() => withPasskey(prepared(), !!props.invite)} disabled={busy() || !prepared()} aria-describedby="gate-how">
            {props.invite ? 'Make my passkey' : 'Sign in with your passkey'}
          </button>
        </div>
        <p id="gate-how" class="gate-how">
          {props.invite
            ? 'A passkey stays on this device, behind Face ID, Touch ID, Windows Hello or your device’s PIN. You can add the other way later in Your account. This link works once.'
            : 'Forgot your password? Ask Bart for a link to choose a new one. A passkey is on the device you set it up on.'}
        </p>
      </Show>
    </Letter>
  )
}

/** The admin's one-time link: choose a (new) password, and you are in. */
function ResetPassword(props: { token: string; onSignedIn: () => void }) {
  const [problem, setProblem] = createSignal<Problem | null>(null)
  const [busy, setBusy] = createSignal(false)
  const [password, setPassword] = createSignal('')
  const [info] = createResource(async () => {
    try {
      return await account.resetInfo(props.token)
    } catch (e) {
      setProblem(problemOf(e, 'Ola’s computer did not answer. Reload to try again.'))
      return null
    }
  })
  const submit = async (e: Event) => {
    e.preventDefault()
    if (busy() || !info()) return
    setProblem(null)
    if (!password()) return setProblem({ text: 'Choose a password.', detail: null })
    setBusy(true)
    try {
      await account.reset(props.token, password())
      if (await cookieKept(setProblem)) props.onSignedIn()
    } catch (err) {
      setProblem(problemOf(err, 'Ola’s computer did not answer. Check your connection and try again.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Letter name={info()?.name.replace(/\.+$/, '')}>
      <p class="gate-lede">{info()?.hasPassword ? 'Choose a new password for Ola.' : 'Choose a password for Ola.'}</p>
      <Show when={problem()}>{(p) => <GateProblem problem={p()} />}</Show>
      <Show when={info()}>
        {(i) => (
          <form class="gate-form" onSubmit={submit} novalidate>
            <input type="text" name="username" autocomplete="username" value={i().handle} hidden readOnly />
            <PasswordField id="reset-password" label={i().hasPassword ? 'New password' : 'Choose a password'} autocomplete="new-password" value={password()} onInput={setPassword} hint={`At least ${i().min} characters. A few words in a row works well. You sign in as ${i().handle}.`} />
            <button type="submit" class="paper-button" disabled={busy()}>
              {busy() ? 'Saving…' : 'Save my password'}
            </button>
            <p class="gate-how">{i().hasPassword ? 'This link works once. Saving signs you out everywhere else, the Ola app on your Macs too. Your passkeys keep working.' : 'This link works once. Your passkeys keep working.'}</p>
          </form>
        )}
      </Show>
    </Letter>
  )
}

/** The person's own account: password, passkeys, the switch, their Macs, sign out everywhere. */
function AccountView(props: { me: Me; onSignOut: () => void }) {
  const [info, { refetch }] = createResource(() => account.get())
  const [said, setSaid] = createSignal<{ text: string; bad?: boolean } | null>(null)
  const [busy, setBusy] = createSignal(false)
  const [current, setCurrent] = createSignal('')
  const [next, setNext] = createSignal('')
  const back = () => `${location.pathname}${location.search}#/`
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    if (busy()) return false
    setBusy(true)
    setSaid(null)
    try {
      await fn()
      setSaid({ text: ok })
      await refetch()
      return true
    } catch (e) {
      setSaid({ text: problemOf(e, 'Ola’s computer could not do that just now. Nothing was changed.').text, bad: true })
      return false
    } finally {
      setBusy(false)
    }
  }
  const savePassword = async (e: Event, a: AccountInfo) => {
    e.preventDefault()
    if ((await act(() => account.setPassword(current(), next()), a.hasPassword ? 'Your password is changed. Every other sign-in was ended, the Ola app on your Macs too.' : 'Your password is saved. You can now sign in with it or with your passkey.')) === true) {
      setCurrent('')
      setNext('')
    }
  }
  return (
    <Room>
      <div class="gate-head">
        <h1 class="gate-title">Your account</h1>
        <a class="ghost-button on-room" href={back()}>
          Back to your projects
        </a>
      </div>
      <p class="gate-lede account-who">
        You sign in as <strong>{props.me.person.handle}</strong>.
      </p>
      <Show when={said()}>{(s) => (s().bad ? <GateProblem problem={{ text: s().text, detail: null }} /> : <p class="account-said" role="status">{s().text}</p>)}</Show>
      <Show when={info()} fallback={<p class="gate-lede">{info.error ? 'Ola’s computer did not answer. Reload to try again.' : 'Opening…'}</p>}>
        {(a) => (
          <div class="account-cards">
            <section class="account-card" aria-labelledby="acct-password">
              <h2 id="acct-password">Password</h2>
              <p class="account-note">{a().hasPassword ? `Set on ${day(a().passwordSetAt!)}.` : 'You have no password yet. Choose one to sign in without your passkey.'}</p>
              <Show when={!a().hasPassword && !a().fresh}>
                <p class="account-note">For your safety, sign out and sign in again with your passkey, then choose a password within 15 minutes.</p>
              </Show>
              <form class="account-form" onSubmit={(e) => savePassword(e, a())} novalidate>
                <input type="text" name="username" autocomplete="username" value={props.me.person.handle} hidden readOnly />
                <Show when={a().hasPassword}>
                  <PasswordField paper id="acct-current" label="Current password" autocomplete="current-password" value={current()} onInput={setCurrent} />
                </Show>
                <PasswordField paper id="acct-new" label={a().hasPassword ? 'New password' : 'Choose a password'} autocomplete="new-password" value={next()} onInput={setNext} hint={`At least ${a().minLength} characters. A few words in a row works well.`} />
                <div>
                  <button type="submit" class="primary-button ghost-button" disabled={busy() || !next()}>
                    {a().hasPassword ? 'Change my password' : 'Save my password'}
                  </button>
                </div>
              </form>
            </section>

            <section class="account-card" aria-labelledby="acct-passkeys">
              <h2 id="acct-passkeys">Passkeys</h2>
              <Show when={a().passkeys.length} fallback={<p class="account-note">No passkey yet. A passkey signs you in with Face ID, Touch ID, Windows Hello or your device’s PIN, and nobody can guess it.</p>}>
                <ul class="account-list">
                  <For each={a().passkeys}>{(k) => <li>A passkey added {day(k.added)}{k.lastUsed ? `, last used ${day(k.lastUsed)}` : ''}</li>}</For>
                </ul>
              </Show>
              <div class="account-row">
                <button type="button" class="ghost-button on-paper" disabled={busy() || (a().hasPassword && !current())} onClick={() => act(() => account.addPasskey(current()), 'Your passkey is added. Your other devices will be told once.')}>
                  Add a passkey on this device
                </button>
                <Show when={a().hasPassword}>
                  <span class="account-note">Type your current password above first.</span>
                </Show>
              </div>
              <label class="account-switch">
                <input
                  type="checkbox"
                  checked={a().requirePasskey}
                  disabled={busy() || (!a().passkeys.length && !a().requirePasskey)}
                  onChange={(e) => {
                    const box = e.currentTarget
                    const on = box.checked
                    void act(() => account.requirePasskey(on, current()), on ? 'From now on, your password is followed by your passkey.' : 'Your password alone signs you in again.').then((done) => !done && (box.checked = !on))
                  }}
                />
                <span>
                  <strong>Ask for my passkey too</strong>
                  <span class="account-note">After your password, Ola also asks for your passkey. Turning this off needs your current password, typed above.</span>
                </span>
              </label>
            </section>

            <section class="account-card account-devices" aria-label="Your computers">
              <YourDevices tone="paper" />
            </section>

            <section class="account-card" aria-labelledby="acct-everywhere">
              <h2 id="acct-everywhere">Sign out everywhere</h2>
              <p class="account-note">Ends every sign-in: this browser, your other browsers and Ola on your other computers. Use it if you think someone else knows your password.</p>
              <div>
                <button type="button" class="ghost-button on-paper danger" disabled={busy()} onClick={() => act(() => account.signOutEverywhere(), '').then((ok) => ok && location.replace('/'))}>
                  Sign out everywhere
                </button>
              </div>
            </section>
          </div>
        )}
      </Show>
    </Room>
  )
}

/** "New project" (admins only; the front desk answers anyone else 404): a name, then it opens. */
function NewProject() {
  const [name, setName] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [problem, setProblem] = createSignal<Problem | null>(null)
  const make = async (e: Event) => {
    e.preventDefault()
    if (!name().trim() || busy()) return
    setBusy(true)
    setProblem(null)
    try {
      const r = await desk.newProject(name().trim())
      location.assign(`/?w=${encodeURIComponent(r.slug)}#/`)
    } catch (err) {
      setProblem(problemOf(err, 'The project could not be made. Nothing was added.'))
      setBusy(false)
    }
  }
  return (
    <form class="new-project" onSubmit={make} aria-labelledby="new-project-title">
      <h2 id="new-project-title" class="new-project-title">
        New project
      </h2>
      <p class="gate-lede">A new project starts empty, with its own files and its own sealed computer. You are its owner.</p>
      <div class="new-project-row">
        <label class="sr-only" for="new-project-name">
          The project's name
        </label>
        <input id="new-project-name" type="text" maxlength={80} autocomplete="off" placeholder="The project's name" value={name()} disabled={busy()} onInput={(e) => setName(e.currentTarget.value)} />
        <button type="submit" class="primary-button on-room-primary" disabled={busy() || !name().trim()}>
          {busy() ? 'Making it…' : 'Make the project'}
        </button>
      </div>
      <Show when={busy()}>
        <p class="gate-lede" role="status">
          Making the project. This takes up to a minute.
        </p>
      </Show>
      <Show when={problem()}>{(p) => <GateProblem problem={p()} />}</Show>
    </form>
  )
}

function Projects(props: { me: Me; unknown: boolean; onSignOut: () => void }) {
  const roleWords = { owner: 'You run this project', member: 'You work in this project', viewer: 'You can read this project' }
  return (
    <Room>
      <div class="gate-head">
        <h1 class="gate-title">Your projects, {props.me.person.name}</h1>
        <div class="gate-head-actions">
          <a class="ghost-button on-room" href="#/account">
            Your account
          </a>
          <button type="button" class="ghost-button on-room" onClick={props.onSignOut}>
            Sign out
          </button>
        </div>
      </div>
      <Show when={props.unknown}>
        {/* With no project left, "Here are the ones you can open" pointed at nothing (first-user pass:
            a member removed mid-visit read it above "no project is shared with you yet"). */}
        <GateProblem problem={{ text: props.me.workspaces.length ? 'That project is not one of yours, or it is closed. Here are the ones you can open.' : 'That project is not one of yours, or it is closed.', detail: null }} />
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
      <Show when={props.me.person.admin}>
        <NewProject />
      </Show>
      <Show when={props.me.devices && (props.me.devices.allowed || props.me.devices.count > 0)}>
        <YourDevices tone="room" />
      </Show>
    </Room>
  )
}
