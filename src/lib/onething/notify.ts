// A note to Bart every time a new number joins: an iMessage to his phone,
// plus the same note by email (SendGrid, same sender the rest of hilma uses)
// for when that account has sends again. Never throws: a failed note must
// not block a sign-up.

import { sendIMessage } from '@/lib/f2/bluebubbles'

const TO = 'bdecrem@gmail.com'
const BART = '+16508989508'

export type SignupSource = 'web' | 'imessage' | 'manual'

export async function notifySignup(phone: string, source: SignupSource, userId: string): Promise<void> {
  await Promise.all([textBart(phone, source), emailBart(phone, source, userId)])
}

async function textBart(phone: string, source: SignupSource): Promise<void> {
  if (phone === BART) return
  const how = { web: 'signed in on the site', imessage: 'texted "onething"', manual: 'was added by hand' }[source]
  try {
    await sendIMessage({ addresses: [BART], text: `Onething: new sign-up ${phone} (${how}).` })
  } catch (e) {
    console.error('[onething] sign-up text failed:', e)
  }
}

async function emailBart(phone: string, source: SignupSource, userId: string): Promise<void> {
  const key = process.env.SENDGRID_API_KEY
  if (!key) {
    console.warn('[onething] SENDGRID_API_KEY not set; sign-up email skipped')
    return
  }
  const when = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' })
  const how = { web: 'signed in on the website', imessage: 'texted "onething"', manual: 'was added by hand' }[source]
  const pretty = phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')
  const html = `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#35332f">
<p style="font-size:20px;margin:0 0 12px"><b>${pretty}</b> just joined onething.</p>
<p style="margin:0 0 6px">They ${how}, ${when} Pacific.</p>
<p style="margin:0 0 6px;color:#9a968f">Number: ${phone}<br>User id: ${userId}</p>
<p style="margin:18px 0 0"><a href="https://onething.ink" style="color:#d8534b">onething.ink</a></p>
</div>`
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: TO }] }],
        from: { email: 'amber@intheamber.com', name: 'onething' },
        subject: `onething: new sign-up ${pretty}`,
        content: [{ type: 'text/html', value: html }],
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) console.error(`[onething] sign-up email failed (${res.status}): ${await res.text()}`)
  } catch (e) {
    console.error('[onething] sign-up email failed:', e)
  }
}
