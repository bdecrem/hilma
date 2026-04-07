import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const WINNERS_PATH = path.join(process.cwd(), 'data', 'nowwhat-winners.json')

export async function GET() {
  try {
    const data = await fs.readFile(WINNERS_PATH, 'utf-8')
    return NextResponse.json(JSON.parse(data))
  } catch {
    return NextResponse.json({ winners: [], totalEvaluated: 0, totalAccepted: 0 })
  }
}
