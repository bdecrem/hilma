// Inbound mail for the company's domains, first stop (2026-11-14).
// SendGrid Inbound Parse posts every message here as a multipart form, up to
// 30 MB. The site's own webhook (/api/kochito/mail/in on Vercel) cannot take a
// request over about 4 MB, so a clerk who mailed a large packet reached nobody.
// This function takes the attachments off the message, puts each in the private
// bucket `kochito-files`, and passes the rest of the form on to the site's
// webhook with a list of what it stored (`stored_files`), which records the
// message and a row per file. Whatever the site answers is what SendGrid gets,
// so a failure anywhere is retried by SendGrid for three days.
//
// Deploy:  supabase functions deploy kochito-mail-in --no-verify-jwt --use-api --project-ref <ref>
// Secrets: KOCHITO_MAIL_TOKEN (the same token the site checks), KOCHITO_MAIL_FORWARD
//          (the site's webhook, without the token).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const BUCKET = 'kochito-files'

Deno.serve(async (req) => {
  const token = Deno.env.get('KOCHITO_MAIL_TOKEN') ?? ''
  const forward = Deno.env.get('KOCHITO_MAIL_FORWARD') ?? ''
  const got = new URL(req.url).searchParams.get('t') ?? ''
  if (!token || !forward || got !== token) return new Response('not found', { status: 404 })
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })
  try {
    const form = await req.formData()
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const out = new FormData()
    const stored: { name: string; path: string; bytes: number; type: string | null }[] = []
    const batch = crypto.randomUUID()
    let n = 0
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') { out.append(key, value); continue }
      if (!value.size) continue
      n += 1
      const safe = (value.name || `attachment-${n}`).replace(/[^\w.\-]+/g, '_').slice(-120)
      const path = `mail/${batch}/${n}-${safe}`
      const up = await db.storage.from(BUCKET).upload(path, value, { contentType: value.type || 'application/octet-stream', upsert: true })
      if (up.error) throw new Error(`could not store ${value.name}: ${up.error.message}`)
      stored.push({ name: value.name || safe, path, bytes: value.size, type: value.type || null })
    }
    out.append('stored_files', JSON.stringify(stored))
    const res = await fetch(`${forward}?t=${encodeURIComponent(token)}`, { method: 'POST', body: out })
    return new Response(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } })
  } catch (e) {
    console.error('[kochito-mail-in]', e)
    return new Response(JSON.stringify({ error: 'not stored' }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
})
