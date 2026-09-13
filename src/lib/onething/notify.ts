// A note to Bart every time a new number joins. SendGrid, same sender the
// rest of hilma uses. Never throws: a failed email must not block a sign-up.

const TO = 'bdecrem@gmail.com'

export type SignupSource = 'web' | 'imessage' | 'manual'

export async function notifySignup(phone: string, source: SignupSource, userId: string): Promise<void> {
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
