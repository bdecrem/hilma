// Mail on the company's domains. Incoming messages arrive from SendGrid
// Inbound Parse (a multipart form per message) and are stored in kochito_mail
// (apps/venture/schema/006_kochito_mail.sql). Nothing answers here: the working
// session reads them (scripts/venture/mail.mjs inbox | --wait) and replies.
import { f2Supabase } from '@/lib/f2/supabase'

const DOMAINS = ['kochitolabs.com', 'clerkpdf.com', 'appadopt.com']
export const FILES_BUCKET = 'kochito-files'

// "Jane Doe <jane@city.gov>" → { addr: 'jane@city.gov', name: 'Jane Doe' }
export function parseAddress(raw: string): { addr: string; name: string | null } {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (m) return { addr: m[2].trim().toLowerCase(), name: m[1].trim() || null }
  return { addr: raw.trim().toLowerCase(), name: null }
}

const header = (headers: string, name: string) => headers.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'))?.[1]?.trim() ?? null

export async function storeInbound(form: FormData): Promise<void> {
  const get = (k: string) => (typeof form.get(k) === 'string' ? (form.get(k) as string) : '')
  const from = parseAddress(get('from'))
  let envelope: { to?: string[]; from?: string } = {}
  try {
    envelope = JSON.parse(get('envelope') || '{}')
  } catch {}
  // the address it was delivered to, at one of our domains (the To header may list others)
  const to = [...(envelope.to ?? []), ...get('to').split(',').map((t) => parseAddress(t).addr)].map((t) => t.toLowerCase()).find((t) => DOMAINS.some((d) => t.endsWith('@' + d))) ?? parseAddress(get('to')).addr
  if (!from.addr || !to) throw new Error('mail without a sender or a recipient')
  const headers = get('headers')
  const db = f2Supabase()
  const { data: row, error } = await db
    .from('kochito_mail')
    .insert({
      direction: 'in',
      from_addr: from.addr,
      from_name: from.name,
      to_addr: to,
      subject: get('subject').slice(0, 500),
      body: get('text').slice(0, 200_000),
      html: get('html').slice(0, 400_000) || null,
      message_id: header(headers, 'Message-ID'),
      in_reply_to: header(headers, 'In-Reply-To'),
      meta: { envelope, spam_score: get('spam_score') || null, attachments: Number(get('attachments') || 0), spf: get('SPF') || null, dkim: get('dkim') || null },
    })
    .select('id')
    .single()
  if (error) throw new Error(`kochito mail store failed: ${error.message}`)
  // Attachments are kept (private bucket, a row each in kochito_files: schema 009), so a
  // document a customer mails us is never dropped and its deletion date can be kept.
  // A message over about 4 MB never arrives here at all: the host refuses the post.
  const files = [...form.entries()].filter((e): e is [string, File] => typeof e[1] !== 'string' && e[1].size > 0)
  for (const [i, [, file]] of files.entries()) {
    const safe = (file.name || `attachment-${i + 1}`).replace(/[^\w.\-]+/g, '_').slice(-120)
    const path = `mail/${row.id}/${i + 1}-${safe}`
    const up = await db.storage.from(FILES_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || 'application/octet-stream', upsert: true })
    const rec = await db.from('kochito_files').insert({ source: 'mail', mail_id: row.id, from_addr: from.addr, name: file.name || safe, path: up.error ? null : path, bytes: file.size, content_type: file.type || null })
    // the message itself is stored; a file that could not be kept is logged, and shows in the ledger with no path
    if (up.error || rec.error) console.error('[kochito/mail] attachment not kept:', file.name, up.error?.message ?? rec.error?.message)
  }  // Files the first stop already put in the bucket (supabase/functions/kochito-mail-in, which
  // takes messages too large for this host): only their rows are written here.
  let stored: { name: string; path: string; bytes: number; type: string | null }[] = []
  try {
    stored = JSON.parse(get('stored_files') || '[]')
  } catch {}
  for (const f of stored) {
    if (typeof f?.path !== 'string' || !f.path.startsWith('mail/')) continue
    const rec = await db.from('kochito_files').insert({ source: 'mail', mail_id: row.id, from_addr: from.addr, name: String(f.name ?? f.path).slice(0, 300), path: f.path, bytes: Number(f.bytes) || 0, content_type: f.type ?? null })
    if (rec.error) throw new Error(`kochito file row failed: ${rec.error.message}`) // SendGrid retries; the upload is repeated under a new path
  }
}
