#!/usr/bin/env node
// Mail on the company's domains (kochitolabs.com, clerkpdf.com, appadopt.com).
//   node scripts/venture/mail.mjs inbox                  messages no session has read (marks them read)
//   node scripts/venture/mail.mjs --wait                 blocks until a new message arrives, prints it, exits (a background task)
//   node scripts/venture/mail.mjs thread <address>       everything to and from one address
//   node scripts/venture/mail.mjs send --from hello@clerkpdf.com --to a@b.gov --subject "…" --file body.txt [--reply-to <message id>] [--name "Kit at ClerkPDF"]
// Sending is plain text through SendGrid (the send-only key in .env.local; the
// three domains are authenticated). THE GUARD: a message goes only to an
// address that (a) has written to us, (b) signed up on one of the pages, or
// (c) is listed in apps/venture/private/approved-recipients.txt. Bart reviews
// every cold email and every recipient before it goes out (his rule,
// 2026-11-14); an address is added to that file only with his yes, quoted
// beside it. There is no flag to skip the guard.
import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { beat } from './_state.mjs'

const root = new URL('../../', import.meta.url)
const env = Object.fromEntries(
  readFileSync(new URL('.env.local', root), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
)
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const OURS = ['kochitolabs.com', 'clerkpdf.com', 'appadopt.com']
const args = process.argv.slice(2)
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined)
const show = (m) => console.log(`\n${m.at.slice(0, 16).replace('T', ' ')}Z  ${m.direction === 'in' ? 'FROM' : 'TO  '} ${m.direction === 'in' ? (m.from_name ? `${m.from_name} <${m.from_addr}>` : m.from_addr) + ' → ' + m.to_addr : m.to_addr + ' (as ' + m.from_addr + ')'}\n  ${m.subject}\n${(m.body || '').trim().split('\n').map((l) => '  | ' + l).join('\n')}`)

async function patient(fn) {
  for (let fails = 0; ; fails++) {
    try {
      return await fn()
    } catch (e) {
      if (fails >= 60) throw e
      if (fails === 0) console.error(`(the network failed: ${e.message}; retrying)`)
      await new Promise((r) => setTimeout(r, 30_000))
    }
  }
}
const unseen = async () => {
  const { data, error } = await db.from('kochito_mail').select('*').eq('direction', 'in').is('seen_at', null).order('id')
  if (error) throw new Error(error.message)
  return data
}
const markSeen = (rows) => db.from('kochito_mail').update({ seen_at: new Date().toISOString() }).in('id', rows.map((r) => r.id))

if (args[0] === 'inbox') {
  const rows = await unseen()
  if (!rows.length) console.log('no new mail')
  rows.forEach(show)
  if (rows.length) await markSeen(rows)
} else if (args[0] === '--wait') {
  for (;;) {
    await beat(db, 'mail') // the runner on the Mac mini stays idle while a session is open
    const rows = await patient(unseen)
    if (rows.length) {
      rows.forEach(show)
      await markSeen(rows)
      process.exit(0)
    }
    await new Promise((r) => setTimeout(r, 30_000))
  }
} else if (args[0] === 'thread' && args[1]) {
  const a = args[1].toLowerCase()
  const { data, error } = await db.from('kochito_mail').select('*').or(`from_addr.eq.${a},to_addr.eq.${a}`).order('id')
  if (error) throw new Error(error.message)
  data.forEach(show)
} else if (args[0] === 'send') {
  const from = opt('--from'), to = (opt('--to') || '').toLowerCase(), subject = opt('--subject'), file = opt('--file')
  if (!from || !to || !subject || !file) throw new Error('send needs --from, --to, --subject and --file')
  if (!OURS.some((d) => from.endsWith('@' + d))) throw new Error(`--from must be an address at ${OURS.join(', ')}`)
  // the guard
  const ours = OURS.some((d) => to.endsWith('@' + d))
  const wrote = (await db.from('kochito_mail').select('id').eq('direction', 'in').eq('from_addr', to).limit(1)).data?.length
  const signedUp = (await db.from('kochito_leads').select('id').eq('email', to).limit(1)).data?.length
  const approvedFile = new URL('apps/venture/private/approved-recipients.txt', root)
  const approved = existsSync(approvedFile) && readFileSync(approvedFile, 'utf8').split('\n').some((l) => l.split('#')[0].trim().toLowerCase() === to)
  if (!ours && !wrote && !signedUp && !approved) {
    console.error(`NOT SENT: ${to} has not written to us, has not signed up, and is not in approved-recipients.txt.\nBart reviews every cold email and recipient first; add the address there only with his yes.`)
    process.exit(2)
  }
  const body = readFileSync(file, 'utf8').trim()
  const replyTo = opt('--reply-to')
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: opt('--name') || 'Kit at Kochito Labs' },
      subject,
      content: [{ type: 'text/plain', value: body }],
      ...(replyTo ? { headers: { 'In-Reply-To': replyTo, References: replyTo } } : {}),
      tracking_settings: { click_tracking: { enable: false }, open_tracking: { enable: false } },
    }),
  })
  if (!res.ok) throw new Error(`SendGrid said ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const { error } = await db.from('kochito_mail').insert({ direction: 'out', from_addr: from.toLowerCase(), from_name: opt('--name') || 'Kit at Kochito Labs', to_addr: to, subject, body, in_reply_to: replyTo ?? null, meta: { sendgrid_id: res.headers.get('x-message-id'), why: ours ? 'ours' : wrote ? 'replying' : signedUp ? 'signed up' : 'approved batch' } })
  if (error) throw new Error(`sent, but not stored: ${error.message}`)
  console.log(`sent to ${to} as ${from}`)
} else {
  console.error('usage: mail.mjs inbox | --wait | thread <address> | send --from … --to … --subject … --file …')
  process.exit(1)
}
