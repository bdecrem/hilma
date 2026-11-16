// The front desk's own endpoints: who is signed in, the project and its things, the workspace's
// files, and passkey sign-in. Served by the front desk (../../frontdesk/server.mjs) and by
// dev.mjs for local work (same paths). Every failure becomes a Problem with a plain sentence.
//
// The workspace is named per tab, in the address (?w=<slug>), and sent on every request as
// X-Ola-Workspace; the front desk checks membership on each one. Writes also carry the session's
// CSRF token (X-Ola-CSRF), which the page learns from /api/me.
import type { FileEntry, Me, Problem, ProjectPayload } from './types.ts'

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

export interface FrontDesk {
  me(): Promise<Me>
  signOut(): Promise<void>
  project(): Promise<ProjectPayload>
  files(): Promise<FileEntry[]>
  /** Sends one file to the workspace. Rejects with a DeskError (409 when the name is taken). */
  upload(file: File, opts?: { replace?: boolean }): Promise<{ path: string; size: number }>
  downloadUrl(path: string): string
  remove(path: string): Promise<void>
}

const filePath = (path: string) => `/api/files/${path.split('/').map(encodeURIComponent).join('/')}`

export const desk: FrontDesk = {
  me: () => call<Me>('/api/me'),
  signOut: async () => {
    await call('/api/signout', { method: 'POST' })
  },
  project: () => call<ProjectPayload>('/api/project'),
  files: async () => (await call<{ files: FileEntry[] }>('/api/files')).files,
  upload: (file, opts) =>
    call(`/api/files?name=${encodeURIComponent(file.name)}${opts?.replace ? '&replace=1' : ''}`, {
      method: 'POST',
      body: file,
      headers: { 'content-type': 'application/octet-stream' },
    }),
  // A download is a plain link (no custom headers), so it names the workspace in the address.
  downloadUrl: (path) => `${filePath(path)}?w=${encodeURIComponent(workspace() ?? '')}`,
  remove: async (path) => {
    await call(filePath(path), { method: 'DELETE' })
  },
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
