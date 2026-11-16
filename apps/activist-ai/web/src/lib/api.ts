// The front desk's own endpoints: the project and its things, and the workspace's files.
// Served by dev.mjs now and by the real front desk later (same paths, plus a session cookie).
// Every failure becomes a Problem with a plain sentence; nothing fails silently.
import type { FileEntry, Problem, ProjectPayload } from './types.ts'

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

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { ...init, credentials: 'same-origin', headers: { accept: 'application/json', ...(init?.headers ?? {}) } })
  } catch (e) {
    throw new DeskError({ ...UNREACHABLE, detail: String(e) }, 0)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const text = typeof body?.message === 'string' ? body.message : res.status === 404 ? 'That is no longer there.' : 'Ola’s computer could not do that.'
    throw new DeskError({ text, detail: `${res.status} ${body?.error ?? ''}`.trim() }, res.status)
  }
  return body as T
}

export interface FrontDesk {
  project(): Promise<ProjectPayload>
  files(): Promise<FileEntry[]>
  /** Sends one file to the workspace. Rejects with a DeskError (409 when the name is taken). */
  upload(file: File, opts?: { replace?: boolean }): Promise<{ path: string; size: number }>
  downloadUrl(path: string): string
  remove(path: string): Promise<void>
}

export const desk: FrontDesk = {
  project: () => call<ProjectPayload>('/api/project'),
  files: async () => (await call<{ files: FileEntry[] }>('/api/files')).files,
  upload: (file, opts) =>
    call(`/api/files?name=${encodeURIComponent(file.name)}${opts?.replace ? '&replace=1' : ''}`, {
      method: 'POST',
      body: file,
      headers: { 'content-type': 'application/octet-stream' },
    }),
  downloadUrl: (path) => `/api/files/${path.split('/').map(encodeURIComponent).join('/')}`,
  remove: async (path) => {
    await call(`/api/files/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' })
  },
}
