import { NextResponse } from 'next/server'
import { signedFileUrl, storagePath } from '@/lib/mrd/db'

// The original PDF or HTML page the crawl downloaded, through a ten-minute signed link.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await storagePath(id)
  if (!row?.path) return NextResponse.json({ error: 'no stored file' }, { status: 404 })
  const ext = row.path.split('.').pop() || 'html'
  const name = `${row.name.replace(/[^\p{L}\p{N} ,.()-]+/gu, '').slice(0, 120).trim() || id}.${ext}`
  return NextResponse.redirect(await signedFileUrl(row.path, ext === 'pdf' ? undefined : name), 302)
}
