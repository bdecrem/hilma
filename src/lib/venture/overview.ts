// Ola in one page, on the board (OLA-132). Bart, 2026-11-17: a one-page overview "that's always up
// to date so agents can refer to that for context... critical that it's up to date."
//
// The page is apps/activist-ai/OVERVIEW.md, read from the deployment's files (next.config.ts traces
// it into the board's routes). Whether it is stale is the rule of scripts/venture/overview-check.mjs:
// a commit on main since the header's "Last checked against" hash that changed anything under
// apps/activist-ai other than OVERVIEW.md. Vercel's functions have no git, so the board asks
// GitHub's public API (the repo is public; GITHUB_TOKEN is used when set): Ola's commits on main by
// path that come after the checked commit (a compare against main), and for any that also touched
// OVERVIEW.md, that commit's own file list. The answer is cached for 15 minutes; when GitHub cannot be read, the card
// says so instead of guessing.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { unstable_cache } from 'next/cache'

const REPO = 'bdecrem/hilma'
const DIR = 'apps/activist-ai'
const FILE = `${DIR}/OVERVIEW.md`
export const OVERVIEW_GITHUB = `https://github.com/${REPO}/blob/main/${FILE}`

export type Freshness =
  | { state: 'current' }
  | { state: 'stale'; count: number; commits: { sha: string; subject: string; at: string }[] }
  | { state: 'unknown'; why: string }
export type Overview = { body: string; hash: string | null; date: string | null; lede: string; fresh: Freshness }

type GhListed = { sha: string; commit: { message: string; committer: { date: string } | null } }

async function gh<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'kochito-board' }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error(`GitHub answered ${res.status}${res.headers.get('x-ratelimit-remaining') === '0' ? ' (rate limit)' : ''}`)
  return (await res.json()) as T
}

async function freshness(hash: string): Promise<Freshness> {
  try {
    // every commit on main since the checked one (GitHub lists up to 250), and which of them touched Ola
    const cmp = await gh<{ status: string; ahead_by: number; commits: GhListed[] }>(`/compare/${hash}...main`)
    if (cmp.status !== 'ahead' && cmp.status !== 'identical') return { state: 'unknown', why: `the checked commit ${hash} is not on main` }
    if (!cmp.ahead_by) return { state: 'current' }
    const after = new Set(cmp.commits.map((c) => c.sha))
    const ola = await gh<GhListed[]>(`/commits?sha=main&path=${DIR}&per_page=100`)
    const since = ola.filter((c) => after.has(c.sha))
    if (!since.length) return { state: 'current' }
    // a commit that touched OVERVIEW.md counts only if it also changed something else under apps/activist-ai
    const touched = new Set((await gh<GhListed[]>(`/commits?sha=main&path=${FILE}&per_page=30`)).map((c) => c.sha))
    const counted: GhListed[] = []
    for (const c of since) {
      if (!touched.has(c.sha)) counted.push(c)
      else {
        const files = (await gh<{ files?: { filename: string }[] }>(`/commits/${c.sha}`)).files ?? []
        if (files.some((f) => f.filename.startsWith(`${DIR}/`) && f.filename !== FILE)) counted.push(c)
      }
    }
    if (!counted.length) return { state: 'current' }
    return { state: 'stale', count: counted.length, commits: counted.map((c) => ({ sha: c.sha, subject: c.commit.message.split('\n')[0], at: c.commit.committer?.date ?? '' })) }
  } catch (e) {
    return { state: 'unknown', why: (e as Error).message }
  }
}

const cachedFreshness = unstable_cache(freshness, ['ola-overview-freshness-2'], { revalidate: 900 })

export async function loadOverview(): Promise<Overview> {
  const body = await readFile(join(process.cwd(), FILE), 'utf8')
  const m = body.match(/^Last checked against: `([0-9a-f]{7,40})` \((\d{4}-\d{2}-\d{2})\)/m)
  // the card's few lines: the first paragraph of "What Ola is", without its markdown
  const section = body.split(/^## /m).find((s) => s.startsWith('What Ola is')) ?? ''
  const lede = (section.split('\n\n')[1] ?? '').replace(/\s*\n\s*/g, ' ').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim()
  if (!m) return { body, hash: null, date: null, lede, fresh: { state: 'unknown', why: 'the page has no "Last checked against" line' } }
  return { body, hash: m[1], date: m[2], lede, fresh: await cachedFreshness(m[1]) }
}
