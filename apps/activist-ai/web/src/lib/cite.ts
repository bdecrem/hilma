// A citation in the agreed form (workspace/AGENTS.md): [report.pdf, p. 7](doc:report.pdf#page=7).
// The page turns it into an Open link to that file at that page. The path must be a plain path in
// the project that Open can show (the front desk checks it again); no other kind of link is ever
// made from model text.
import { canOpen, plainPath } from './api.ts'

export const CITE = /\[([^\]\n]{1,200})\]\(doc:([^)#\s]{1,1300})(?:#page=(\d{1,6}))?\)/
/** The same, without capture groups, for splitting a line. */
export const CITE_SPLIT = /\[[^\]\n]{1,200}\]\(doc:[^)#\s]{1,1300}(?:#page=\d{1,6})?\)/

export function citation(part: string): { label: string; path: string; page?: number } | null {
  const m = new RegExp(`^${CITE.source}$`).exec(part)
  if (!m) return null
  let path: string
  try {
    path = decodeURIComponent(m[2])
  } catch {
    return null
  }
  if (!plainPath(path) || !canOpen(path)) return null
  const page = m[3] ? Number(m[3]) : 0
  return { label: m[1], path, page: page > 0 ? page : undefined }
}
