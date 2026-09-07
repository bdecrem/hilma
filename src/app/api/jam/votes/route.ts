// GET  /api/jam/votes?track=<id> → { votes: { turnId: score }, taste, recent: [what the agent is told] }
// POST /api/jam/votes { trackId, turnId, score, prompt?, reply?, actions?, state? }
//      → { ok, score, tasteUpdated }   (score 0 removes the vote)
//
// One vote per agent turn, on the signed-in user's own track. Votes feed the
// per-user taste note the LLM route appends to the agent's prompt
// (src/lib/jam/taste.ts).

import { NextResponse } from 'next/server'
import { getJamUser } from '@/lib/jam/auth'
import { jamDb } from '@/lib/jam/db'
import { getTaste, listVotes, maybeRefreshTaste, recentVotes, recordVote } from '@/lib/jam/taste'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i
const err = (error: string, status: number) => NextResponse.json({ error }, { status })

async function ownsTrack(userId: string, trackId: string): Promise<boolean> {
  const { data, error } = await jamDb().from('jam_tracks').select('id').eq('id', trackId).eq('user_id', userId).maybeSingle()
  if (error) throw new Error(`track lookup failed: ${error.message}`)
  return !!data
}

export async function GET(req: Request) {
  const user = await getJamUser()
  if (!user) return err('not signed in', 401)
  const trackId = new URL(req.url).searchParams.get('track') || ''
  if (!UUID_RE.test(trackId)) return err('track required', 400)
  try {
    const [votes, taste, recent] = await Promise.all([listVotes(user.id, trackId), getTaste(user.id), recentVotes(user.id)])
    return NextResponse.json({ votes, taste, recent })
  } catch (e) {
    console.error('[jam/votes] read', (e as Error).message)
    return err('Could not load the votes.', 500)
  }
}

export async function POST(req: Request) {
  const user = await getJamUser()
  if (!user) return err('not signed in', 401)
  let body: {
    trackId?: unknown; turnId?: unknown; score?: unknown
    prompt?: unknown; reply?: unknown; actions?: unknown; state?: unknown
  }
  try { body = await req.json() } catch { return err('Invalid JSON', 400) }

  const trackId = typeof body.trackId === 'string' ? body.trackId : ''
  const turnId = typeof body.turnId === 'string' ? body.turnId.trim().slice(0, 80) : ''
  const score = typeof body.score === 'number' && Number.isInteger(body.score) ? body.score : NaN
  if (!UUID_RE.test(trackId)) return err('trackId required', 400)
  if (!turnId) return err('turnId required', 400)
  if (!(score >= -3 && score <= 3)) return err('score must be -3..3', 400)
  const actions = Array.isArray(body.actions) ? body.actions.filter((a): a is string => typeof a === 'string').slice(0, 40) : []
  const state = body.state && typeof body.state === 'object' && JSON.stringify(body.state).length <= 4000 ? body.state : undefined

  try {
    if (!(await ownsTrack(user.id, trackId))) return err('not found', 404)
    await recordVote(user.id, {
      trackId,
      turnId,
      score,
      prompt: typeof body.prompt === 'string' ? body.prompt.slice(0, 2000) : undefined,
      reply: typeof body.reply === 'string' ? body.reply.slice(0, 1000) : undefined,
      actions,
      state,
    })
  } catch (e) {
    console.error('[jam/votes] write', (e as Error).message)
    return err('Could not save the vote.', 500)
  }

  // The note is a bonus on top of a stored vote: a model or table problem
  // here is logged, never reported as a failed vote.
  let tasteUpdated = false
  if (score !== 0) {
    try {
      tasteUpdated = await maybeRefreshTaste(user.id)
      if (tasteUpdated) console.log('[jam/votes] taste note rewritten for', user.username)
    } catch (e) {
      console.error('[jam/votes] taste', (e as Error).message)
    }
  }
  return NextResponse.json({ ok: true, score, tasteUpdated })
}
