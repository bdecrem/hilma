import { NextResponse } from 'next/server'
import { f2Supabase } from '@/lib/f2/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/venture/commits/sync (Vercel cron, every 30 minutes, Bearer CRON_SECRET): the issue
// tracker learns about new commits on main by itself. It reads them from GitHub's public API (the
// repo is public: no token needed; GITHUB_TOKEN is used when set, for a higher limit) and files each
// one in venture_commits:
//   - a commit whose subject or body names an issue, like [OLA-142], is attached to that issue;
//   - an Ola commit (subject starting "ola", "ola.cx", "ola-…" or "activist-ai") that names none
//     waits as an unsorted commit on the board until the lead places it (issues.mjs place);
//   - every other commit (other projects in this repo) is left out.
// A commit already filed is never changed here, so the lead's placing stands. How far it has read
// is venture_state "commit_sync"; the board says when the last read failed.
const REPO = 'bdecrem/hilma'
const OLA = /^(ola\b|ola[.-]|activist-ai)/i
const IDS = /\[(OLA-\d+)\]/gi

type GhCommit = { sha: string; commit: { message: string; author: { date: string } | null; committer: { date: string } | null } }

async function record(value: Record<string, unknown>) {
  await f2Supabase().from('venture_state').upsert({ key: 'commit_sync', value: { at: new Date().toISOString(), ...value }, at: new Date().toISOString() })
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = f2Supabase()
  const prev = (await db.from('venture_state').select('value').eq('key', 'commit_sync').maybeSingle()).data?.value as { since?: string } | undefined
  // read from an hour before the newest commit seen (commits can arrive with older dates after a rebase)
  const since = new Date(Math.min(Date.now(), Date.parse(prev?.since ?? new Date(Date.now() - 86400e3).toISOString())) - 3600e3).toISOString()
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'kochito-board' }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const all: GhCommit[] = []
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`https://api.github.com/repos/${REPO}/commits?sha=main&per_page=100&page=${page}&since=${encodeURIComponent(since)}`, { headers, cache: 'no-store' })
    if (!res.ok) {
      const why = `GitHub answered ${res.status}${res.headers.get('x-ratelimit-remaining') === '0' ? ' (rate limit)' : ''}`
      await record({ ok: false, why, since: prev?.since ?? since })
      return NextResponse.json({ ok: false, why }, { status: 502 })
    }
    const list = (await res.json()) as GhCommit[]
    all.push(...list)
    if (list.length < 100) break
  }
  const rows = all
    .map((c) => {
      const [subject, ...rest] = c.commit.message.split('\n')
      const ids = [...c.commit.message.matchAll(IDS)].map((m) => m[1].toUpperCase())
      return { sha: c.sha, subject: subject.slice(0, 500), body: rest.join('\n').trim().slice(0, 4000), at: c.commit.author?.date ?? c.commit.committer?.date ?? new Date().toISOString(), ids, ola: OLA.test(subject) }
    })
    .filter((r) => r.ids.length || r.ola)
  const wanted = [...new Set(rows.flatMap((r) => r.ids))]
  const known = new Set<string>()
  if (wanted.length) {
    const { data, error } = await db.from('venture_issues').select('id').in('id', wanted)
    if (error) {
      await record({ ok: false, why: `issues: ${error.message}`, since: prev?.since ?? since })
      return NextResponse.json({ ok: false, why: error.message }, { status: 500 })
    }
    for (const r of data) known.add(r.id)
  }
  const filed = rows.map((r) => ({ sha: r.sha, subject: r.subject, body: r.body, at: r.at, issue_id: r.ids.find((id) => known.has(id)) ?? null }))
  if (filed.length) {
    const { error } = await db.from('venture_commits').upsert(filed, { onConflict: 'sha', ignoreDuplicates: true })
    if (error) {
      await record({ ok: false, why: `commits: ${error.message}`, since: prev?.since ?? since })
      return NextResponse.json({ ok: false, why: error.message }, { status: 500 })
    }
  }
  const newest = all.reduce((m, c) => { const t = c.commit.committer?.date ?? ''; return t > m ? t : m }, prev?.since ?? since)
  await record({ ok: true, since: newest, read: all.length, filed: filed.length, attached: filed.filter((f) => f.issue_id).length })
  return NextResponse.json({ ok: true, read: all.length, filed: filed.length })
}
