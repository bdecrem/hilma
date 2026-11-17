// The front desk's own endpoints: who is signed in, the project and its things, the workspace's
// files, and passkey sign-in. Served by the front desk (../../frontdesk/server.mjs) and by
// dev.mjs for local work (same paths). Every failure becomes a Problem with a plain sentence.
//
// The workspace is named per tab, in the address (?w=<slug>), and sent on every request as
// X-Ola-Workspace; the front desk checks membership on each one. Writes also carry the session's
// CSRF token (X-Ola-CSRF), which the page learns from /api/me.
import type { DataSummary, DocsPage, FileEntry, Me, Problem, ProjectPayload, Settings, TablePage } from './types.ts'

export class DeskError extends Error {
  problem: Problem
  status: number
  constructor(problem: Problem, status: number) {
    super(problem.text)
    this.problem = problem
    this.status = status
  }
}

const UNREACHABLE: Problem = { text: 'Ola’s computer did not answer. Check your connection; nothing was changed.', detail: null }

/** The workspace this tab is on, from ?w= in the address. */
export const workspace = (): string | null => new URLSearchParams(location.search).get('w')
let csrf = ''
export const setCsrf = (t: string) => (csrf = t)
// The largest file the front desk accepts (from /api/me). A larger one is refused here, before a
// byte is sent: a browser still sending a body rarely reads the 413 the server answered with.
let maxUpload = 0
export const setMaxUpload = (n: number | undefined) => (maxUpload = Number.isSafeInteger(n) && n! > 0 ? n! : 0)
/** The same sentence as the server's (web/server/files.mjs, tooLargeMessage). */
const tooLarge = (max: number) => `That file is larger than ${Math.round((max / 1024 / 1024) * 10) / 10} MB, the most Ola accepts.`
/** Headers for every request to the front desk (the opencode client gets them too). */
export const deskHeaders = (): Record<string, string> => ({ ...(workspace() ? { 'x-ola-workspace': workspace()! } : {}), ...(csrf ? { 'x-ola-csrf': csrf } : {}) })

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { ...init, credentials: 'same-origin', headers: { accept: 'application/json', ...deskHeaders(), ...(init?.headers ?? {}) } })
  } catch (e) {
    throw new DeskError({ ...UNREACHABLE, detail: String(e) }, 0)
  }
  const body = await res.json().catch(() => null)
  // The session ended (signed out elsewhere, revoked, expired): the page goes back to sign-in.
  if (res.status === 401 && path !== '/api/me' && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event('ola:signed-out'))
  if (!res.ok) {
    const text = typeof body?.message === 'string' ? body.message : res.status === 404 ? 'That is no longer there.' : 'Ola’s computer could not do that.'
    throw new DeskError({ text, detail: `${res.status} ${body?.error ?? ''}`.trim() }, res.status)
  }
  return body as T
}
const post = <T>(path: string, body: unknown) => call<T>(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

export interface RunsPayload {
  executing: number
  stopped: { session: string; at: string; minutes: number; message: string }[]
}

export interface FrontDesk {
  me(): Promise<Me>
  signOut(): Promise<void>
  project(): Promise<ProjectPayload>
  /** Runs the front desk stopped at the run ceiling in the last day, and why (the message to show). */
  runs(): Promise<RunsPayload>
  files(): Promise<FileEntry[]>
  /** Sends one file to the workspace. Rejects with a DeskError (409 when the name is taken). */
  upload(file: File, opts?: { replace?: boolean }): Promise<{ path: string; size: number }>
  downloadUrl(path: string): string
  /** Where "Open" on a page goes: the front desk shows it, sandboxed, in a new tab. */
  openUrl(path: string): string
  remove(path: string): Promise<void>
  settings(): Promise<Settings>
  /** "Always in this project" for web search and downloads, on or off. */
  setWeb(always: boolean): Promise<Settings['web']>
  data(): Promise<DataSummary>
  table(name: string, opts: { offset?: number; limit?: number; sort?: string; dir?: 'asc' | 'desc'; q?: string }): Promise<TablePage>
  docs(opts: { q?: string; offset?: number }): Promise<DocsPage>
  databaseUrl(): string
  excelUrl(table: string): string
}

const qs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')

const filePath = (path: string) => `/api/files/${path.split('/').map(encodeURIComponent).join('/')}`

// ---------------------------------------------------------------- Fallback to Claude
export interface ClaudeRunRecord {
  run: string
  at: number
  autonomy: 'go' | 'ask'
  why: 'asked' | 'stuck' | 'always'
  request: string
  events: any[]
  active: boolean
}

/** Reads an NDJSON reply line by line until it ends (or the signal aborts). */
async function ndjson(res: Response, onEvent: (e: any) => void): Promise<void> {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      if (!line.trim()) continue
      let e
      try {
        e = JSON.parse(line)
      } catch {
        continue // a line that is not JSON is not ours
      }
      try {
        onEvent(e)
      } catch (err) {
        console.error('ola: a Claude event could not be shown', err)
      }
    }
  }
}
async function stream(path: string, init: RequestInit, onEvent: (e: any) => void): Promise<void> {
  let res: Response
  try {
    res = await fetch(path, { ...init, credentials: 'same-origin', headers: { accept: 'application/x-ndjson', ...deskHeaders(), ...(init.headers ?? {}) } })
  } catch (e) {
    throw new DeskError({ ...UNREACHABLE, detail: String(e) }, 0)
  }
  if (res.status === 401) window.dispatchEvent(new Event('ola:signed-out'))
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new DeskError({ text: typeof body?.message === 'string' ? body.message : 'Claude could not start just now.', detail: `${res.status} ${body?.error ?? ''}`.trim() }, res.status)
  }
  await ndjson(res, onEvent)
}

export const claude = {
  info: () => call<import('./types.ts').ClaudeInfo>('/api/claude'),
  settings: (body: { enabled?: boolean; consent?: boolean; auto?: string }) => post<import('./types.ts').ClaudeInfo>('/api/claude/settings', body),
  /** Starts a run and reads it until it ends; each line goes to onEvent. */
  run: (body: { request: string; context: string; conversation: string; autonomy: 'go' | 'ask'; why: 'asked' | 'stuck' | 'always'; once?: boolean }, onEvent: (e: any) => void, signal?: AbortSignal) =>
    stream('/api/claude/run', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' }, signal }, onEvent),
  /** A run already going (after a lost connection): its lines so far, then the rest. */
  follow: (run: string, onEvent: (e: any) => void, signal?: AbortSignal) => stream(`/api/claude/follow?run=${encodeURIComponent(run)}`, { signal }, onEvent),
  answer: (run: string, requestId: string, decision: 'once' | 'always' | 'reject') => post('/api/claude/answer', { run, request_id: requestId, decision }),
  stop: (run: string) => post('/api/claude/stop', { run }),
  turns: async (conversation: string) => (await call<{ runs: ClaudeRunRecord[] }>(`/api/claude/turns?conversation=${encodeURIComponent(conversation)}`)).runs,
}

// ---------------------------------------------------------------- both fallbacks, and the hosted open model
export const fallback = {
  info: () => call<import('./types.ts').FallbackInfo>('/api/fallback'),
  /** "When a request looks like a stretch", and where a handover goes (owner only). */
  settings: (body: { stretch?: string; stretchTo?: string }) => post<{ stretch: string; stretchTo: string }>('/api/fallback/settings', body),
}
export const hosted = {
  settings: (body: { enabled?: boolean; consent?: boolean }) => post<import('./types.ts').HostedInfo>('/api/hosted/settings', body),
  /** One request with the hosted open model, in this conversation; its run is followed on opencode's own stream. */
  run: (body: { request: string; conversation: string; once?: boolean }) => post<{ ok: true; run: string; provider: string }>('/api/hosted/run', body),
}

export const desk: FrontDesk = {
  me: () => call<Me>('/api/me'),
  signOut: async () => {
    await call('/api/signout', { method: 'POST' })
  },
  project: () => call<ProjectPayload>('/api/project'),
  runs: () => call<RunsPayload>('/api/runs'),
  files: async () => (await call<{ files: FileEntry[] }>('/api/files')).files,
  upload: (file, opts) =>
    maxUpload && file.size > maxUpload
      ? Promise.reject(new DeskError({ text: tooLarge(maxUpload), detail: '413 too_large (not sent)' }, 413))
      : call(`/api/files?name=${encodeURIComponent(file.name)}${opts?.replace ? '&replace=1' : ''}`, {
      method: 'POST',
      body: file,
      headers: { 'content-type': 'application/octet-stream' },
    }),
  // A download is a plain link (no custom headers), so it names the workspace in the address.
  downloadUrl: (path) => `${filePath(path)}?w=${encodeURIComponent(workspace() ?? '')}`,
  openUrl: (path) => `/api/open?w=${encodeURIComponent(workspace() ?? '')}&path=${encodeURIComponent(path)}`,
  remove: async (path) => {
    await call(filePath(path), { method: 'DELETE' })
  },
  settings: () => call<Settings>('/api/settings'),
  setWeb: async (always) => (await post<{ web: Settings['web'] }>('/api/settings/web', { always })).web,
  data: () => call<DataSummary>('/api/data'),
  table: (name, o) => call<TablePage>(`/api/data/table?${qs({ name, offset: o.offset, limit: o.limit, sort: o.sort, dir: o.dir, q: o.q })}`),
  docs: (o) => call<DocsPage>(`/api/data/docs?${qs({ q: o.q, offset: o.offset })}`),
  databaseUrl: () => `/api/data/download?w=${encodeURIComponent(workspace() ?? '')}`,
  excelUrl: (table) => `/api/data/xlsx?${qs({ name: table, w: workspace() ?? '' })}`,
}

// ---------------------------------------------------------------- passkeys (WebAuthn)
//
// The server sends WebAuthn options as JSON (base64url for binary); the browser API wants
// ArrayBuffers and gives ArrayBuffers back. These two small converters are all the glue.
const fromB64 = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0)).buffer
}
const toB64 = (buf: ArrayBuffer | null) =>
  buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : undefined

/** Plain words for what the browser said when a passkey step did not happen. */
function passkeyProblem(e: unknown): DeskError {
  if (e instanceof DeskError) return e
  const name = (e as DOMException)?.name
  const text =
    name === 'NotAllowedError'
      ? 'The passkey step was cancelled or timed out. Nothing was changed; try again when you are ready.'
      : name === 'InvalidStateError'
        ? 'This device already has a passkey for Ola. Use “Sign in with your passkey” instead.'
        : name === 'NotSupportedError' || !window.PublicKeyCredential
          ? 'This browser cannot use passkeys. Try a current Safari, Chrome, Edge or Firefox.'
          : 'Your passkey could not be used just now. Nothing was changed.'
  return new DeskError({ text, detail: String(e) }, 0)
}

export interface Prepared {
  ceremony: string
  options: any
  /** On an invitation: the name Bart gave the person, for the greeting. */
  name?: string
}

export const passkeys = {
  /** Step one of an invitation: the server's options (and the person's name) for a new passkey. */
  prepareRegister: (invite: string) => post<Prepared>('/api/auth/register/options', { invite }),
  /** Step one of a sign-in: a fresh challenge for any passkey this device holds for Ola. */
  prepareSignIn: () => post<Prepared>('/api/auth/login/options', {}),

  /** Makes the passkey (the browser's prompt) and registers it; the front desk then sets the session cookie. */
  async finishRegister({ ceremony, options }: Prepared): Promise<void> {
    try {
      const cred = (await navigator.credentials.create({
        publicKey: {
          ...options,
          challenge: fromB64(options.challenge),
          user: { ...options.user, id: fromB64(options.user.id) },
          excludeCredentials: (options.excludeCredentials ?? []).map((c: any) => ({ ...c, id: fromB64(c.id) })),
        },
      })) as PublicKeyCredential
      const r = cred.response as AuthenticatorAttestationResponse
      await post('/api/auth/register/verify', {
        ceremony,
        response: {
          id: cred.id,
          rawId: toB64(cred.rawId),
          type: cred.type,
          clientExtensionResults: cred.getClientExtensionResults(),
          authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
          response: { clientDataJSON: toB64(r.clientDataJSON), attestationObject: toB64(r.attestationObject), transports: r.getTransports?.() ?? [] },
        },
      })
    } catch (e) {
      throw passkeyProblem(e)
    }
  },

  /** Asks the browser for a passkey and signs in with it. */
  async finishSignIn({ ceremony, options }: Prepared): Promise<void> {
    try {
      const cred = (await navigator.credentials.get({
        publicKey: { ...options, challenge: fromB64(options.challenge), allowCredentials: (options.allowCredentials ?? []).map((c: any) => ({ ...c, id: fromB64(c.id) })) },
      })) as PublicKeyCredential
      const r = cred.response as AuthenticatorAssertionResponse
      await post('/api/auth/login/verify', {
        ceremony,
        response: {
          id: cred.id,
          rawId: toB64(cred.rawId),
          type: cred.type,
          clientExtensionResults: cred.getClientExtensionResults(),
          authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
          response: { clientDataJSON: toB64(r.clientDataJSON), authenticatorData: toB64(r.authenticatorData), signature: toB64(r.signature), userHandle: toB64(r.userHandle) },
        },
      })
    } catch (e) {
      throw passkeyProblem(e)
    }
  },
}
