import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const WINNERS_PATH = path.join(process.cwd(), 'data', 'nowwhat-winners.json')

// PATCH /api/nowwhat/winners/[id] — human judge verdict
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { humanApproved } = await request.json() as { humanApproved: boolean }

  const data = JSON.parse(await fs.readFile(WINNERS_PATH, 'utf-8'))
  const winner = data.winners.find((w: { id: string }) => w.id === id)
  if (!winner) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  winner.humanApproved = humanApproved
  await fs.writeFile(WINNERS_PATH, JSON.stringify(data, null, 2))

  return NextResponse.json({ ok: true, winner })
}
