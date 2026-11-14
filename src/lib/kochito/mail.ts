// Mail on the company's domains. Incoming messages arrive from SendGrid
// Inbound Parse (a multipart form per message) and are stored in kochito_mail
// (apps/venture/schema/006_kochito_mail.sql). Nothing answers here: the working
// session reads them (scripts/venture/mail.mjs inbox | --wait) and replies.
import { f2Supabase } from '@/lib/f2/supabase'

const DOMAINS = ['kochitolabs.com', 'clerkpdf.com', 'appadopt.com']

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
  const { error } = await f2Supabase()
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
  if (error) throw new Error(`kochito mail store failed: ${error.message}`)
}
