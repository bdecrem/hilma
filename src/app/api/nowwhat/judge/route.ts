import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const WINNERS_PATH = path.join(process.cwd(), 'data', 'nowwhat-winners.json')

let lastCallAt = 0
const MIN_INTERVAL = 8000 // 8 seconds between calls

interface Winner {
  id: string
  name: string
  reason: string
  grid: number[][]
  createdAt: string
  fillPercent: number
  humanApproved?: boolean
  sonnetReason?: string
}

interface WinnerPool {
  winners: Winner[]
  totalEvaluated: number
  totalAccepted: number
}

async function readPool(): Promise<WinnerPool> {
  try {
    const data = await fs.readFile(WINNERS_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    return { winners: [], totalEvaluated: 0, totalAccepted: 0 }
  }
}

async function writePool(pool: WinnerPool) {
  await fs.writeFile(WINNERS_PATH, JSON.stringify(pool, null, 2))
}

async function sonnetReview(apiKey: string, gridText: string, haikuName: string, haikuReason: string): Promise<{ approved: boolean; reason: string }> {
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [{ role: 'user', content: `You are the senior curator for "Now What?" — a generative pixel art installation exploring what humans do after AGI. Art, science, community, connection, nature, play, building a better future.

A fast screener named this 26x10 pixel grid "${haikuName}" and said: "${haikuReason}"

Here is the grid (1=filled, 0=empty):
${gridText}

Your job: does this actually look like a recognizable shape that fits our themes? The screener is generous — you should be more selective. Look for:
- A clearly recognizable form (not just abstract blobs)
- Something that genuinely evokes human flourishing, creativity, connection, or wonder
- Compositional quality — does it work as a tiny piece of art?

Respond with JSON only:
{"approved": true or false, "reason": "one sentence — be specific about what you see or don't see"}

Approve maybe 40-60% of what the screener accepted.` }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Sonnet API error:', response.status, err)
      return { approved: false, reason: 'sonnet api error' }
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { approved: false, reason: 'unparseable' }

    return JSON.parse(jsonMatch[0])
  } catch {
    return { approved: false, reason: 'sonnet exception' }
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ accept: false, name: '', reason: 'no API key configured' })
  }

  // Rate limit
  const now = Date.now()
  if (now - lastCallAt < MIN_INTERVAL) {
    return NextResponse.json({ accept: false, name: '', reason: 'rate limited' })
  }
  lastCallAt = now

  const { grid } = await request.json() as { grid: number[][] }
  if (!grid || !Array.isArray(grid)) {
    return NextResponse.json({ accept: false, name: '', reason: 'invalid grid' }, { status: 400 })
  }

  const gridText = grid.map((row: number[]) => row.join('')).join('\n')
  const filled = grid.flat().filter((c: number) => c === 1).length
  const total = grid.length * grid[0].length
  const fillPct = Math.round((filled / total) * 100)

  const prompt = `You are an art critic for a generative pixel art installation called "Now What?"
The theme: what do humans do after AGI arrives? Art, connection, community, nature, building, wonder, science, play, love.

Below is a 26x10 pixel grid that emerged from procedural noise. 1=filled, 0=empty. Fill: ${fillPct}%.

${gridText}

Does this pattern resemble something meaningful? Consider:
- Does it look like a recognizable shape (person, building, nature, symbol, tool, animal)?
- Does it evoke themes of human flourishing, connection, creativity, or wonder?
- Is it aesthetically interesting as abstract art?

Respond with JSON only, no other text:
{"accept": true or false, "name": "short evocative name (2-3 words)", "reason": "one sentence why"}

Be selective but not impossible. Accept roughly 30-40% of patterns. Reject pure noise or blobs with no discernible form.`

  try {
    // Pass 1: Haiku screens
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Judge API error:', err)
      return NextResponse.json({ accept: false, name: '', reason: 'api error' })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ accept: false, name: '', reason: 'unparseable response' })
    }

    const result = JSON.parse(jsonMatch[0]) as { accept: boolean; name: string; reason: string }

    const pool = await readPool()
    pool.totalEvaluated++

    if (result.accept) {
      // Pass 2: Sonnet reviews Haiku's pick
      const review = await sonnetReview(apiKey, gridText, result.name, result.reason)

      pool.totalAccepted++
      pool.winners.push({
        id: `w-${Date.now()}`,
        name: result.name,
        reason: result.reason,
        grid,
        createdAt: new Date().toISOString(),
        fillPercent: fillPct,
        humanApproved: review.approved,
        sonnetReason: review.reason,
      })
      await writePool(pool)

      return NextResponse.json({
        accept: true,
        name: result.name,
        reason: result.reason,
        sonnetApproved: review.approved,
        sonnetReason: review.reason,
        stats: { evaluated: pool.totalEvaluated, accepted: pool.totalAccepted },
      })
    } else {
      await writePool(pool)
      return NextResponse.json({
        accept: false,
        name: result.name,
        reason: result.reason,
        stats: { evaluated: pool.totalEvaluated, accepted: pool.totalAccepted },
      })
    }
  } catch (err) {
    console.error('Judge error:', err)
    return NextResponse.json({ accept: false, name: '', reason: 'exception' })
  }
}
