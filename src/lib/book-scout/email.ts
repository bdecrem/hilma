// Renders + sends the dog ear monthly issue email. Used by the digest /
// monthly endpoints so the cloud agent never needs local secrets.

export type BookSrc = { name: string; said: string }
export type Book = {
  title: string
  author: string
  pub_date: string
  one_line: string
  sources: BookSrc[]
}
// AI-curated picks based on the reader's own library.
export type ClaudePick = {
  title: string
  author: string
  pub_date: string
  one_line: string
  why: string
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function kindleLink(b: { title: string; author: string }): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(`${b.title} ${b.author}`)}&i=digital-text`
}

// dog ear palette (kept in step with the web page).
const P = {
  paper: '#f3ece0', card: '#f8f2e7', ink: '#3b372f', amber: '#e8a13c', caramel: '#b4793a',
  soft: '#8a8475', body: '#544f44', faint: '#a59f90', dash: '#cfc6b4', line: '#ddd4c4',
}
// Web fonts where supported; friendly fallbacks everywhere else.
const SANS = "'Shantell Sans', 'Segoe UI', system-ui, Helvetica, Arial, sans-serif"
const HAND = "'Caveat', 'Shantell Sans', 'Segoe UI', cursive"

// one numbered list row: dog-eared amber badge + content
function row(n: number, inner: string): string {
  return `<tr><td style="padding:22px 0;border-top:1px dashed ${P.dash};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td valign="top" width="54">
        <div style="width:42px;height:48px;background:${P.amber};border-radius:5px 11px 5px 5px;text-align:center;line-height:48px;font-family:${SANS};font-weight:700;font-size:${n > 9 ? 17 : 20}px;color:${P.ink};">${n}</div>
      </td>
      <td valign="top">${inner}</td>
    </tr></table></td></tr>`
}

const label = (text: string) =>
  `<tr><td style="padding:40px 0 2px;font-family:${SANS};font-weight:700;font-size:23px;color:${P.ink};">${esc(text)}</td></tr>`

export function buildDigestHtml(
  books: Book[],
  monthLabel: string,
  genre: string,
  sourceNames: string[],
  claudePicks: ClaudePick[] = [],
): string {
  void genre; void sourceNames
  const title = (b: { title: string; author: string }) =>
    `<a href="${kindleLink(b)}" style="font-family:${SANS};font-weight:700;font-size:21px;color:${P.ink};text-decoration:none;line-height:1.2;">${esc(b.title)} &rarr;</a>`
  const meta = (b: { author: string; pub_date: string }) =>
    `<div style="font-family:${SANS};font-size:13px;color:${P.soft};margin:3px 0 7px;">${esc(b.author)} &middot; ${esc(b.pub_date)}</div>`
  const desc = (s: string) => `<div style="font-family:${SANS};font-size:15px;line-height:1.6;color:${P.body};">${esc(s)}</div>`

  const staff = books
    .map((b, i) => {
      const fav = i === 0 ? `<div style="font-family:${HAND};font-weight:700;font-size:17px;color:${P.caramel};margin-bottom:2px;">&#9733; this month&rsquo;s favorite</div>` : ''
      const src = b.sources[0]
        ? `<div style="font-family:${SANS};font-size:14px;line-height:1.5;color:${P.body};margin-top:9px;"><b style="color:${P.caramel};">${esc(b.sources[0].name.split(' (')[0])}:</b> <i>&ldquo;${esc(b.sources[0].said.replace(/^["“”]|["“”]$/g, ''))}&rdquo;</i></div>`
        : ''
      return row(i + 1, `${fav}${title(b)}${meta(b)}${desc(b.one_line)}${src}`)
    })
    .join('')

  const picks = claudePicks
    .map((p, i) => {
      const why = `<div style="font-family:${SANS};font-size:14px;line-height:1.5;margin-top:9px;"><span style="font-family:${HAND};font-weight:700;font-size:17px;color:${P.caramel};">why it&rsquo;s on your shelf &mdash; </span><span style="color:${P.body};">${esc(p.why)}</span></div>`
      return row(i + 1, `${title(p)}${meta(p)}${desc(p.one_line)}${why}`)
    })
    .join('')

  const claudeBlock = `
    ${label('picked for your shelf')}
    <tr><td style="font-family:${HAND};font-size:18px;color:${P.soft};">claude&rsquo;s own picks, read off your reading list.</td></tr>
    ${claudePicks.length
      ? `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${picks}<tr><td style="border-top:1px dashed ${P.dash};font-size:0;">&nbsp;</td></tr></table></td></tr>`
      : `<tr><td style="padding-top:12px;"><div style="font-family:${SANS};font-size:15px;color:${P.body};background:${P.card};border:1.5px dashed ${P.dash};border-radius:14px;padding:16px;">Upload your reading list at <a href="https://dogear.bar" style="color:${P.caramel};">dogear.bar</a> and claude folds in picks just for you.</div></td></tr>`}`

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Shantell+Sans:ital,wght@0,400;0,600;0,700;1,600&family=Caveat:wght@600;700&display=swap" rel="stylesheet">
</head><body style="margin:0;background:${P.paper};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${P.paper};">
<tr><td align="center" style="padding:26px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <tr><td style="padding-bottom:18px;border-bottom:1px solid ${P.line};">
    <span style="font-family:${SANS};font-weight:700;font-size:27px;color:${P.ink};">🐾 dog ear</span>
  </td></tr>

  <tr><td align="center" style="padding:36px 0 0;">
    <div style="font-family:${HAND};font-weight:700;font-size:22px;color:${P.caramel};">${esc(monthLabel.toLowerCase())}</div>
    <div style="font-family:${SANS};font-weight:700;font-size:40px;color:${P.ink};line-height:1.05;margin-top:4px;">this month&rsquo;s picks</div>
    <div style="font-family:${HAND};font-weight:600;font-size:20px;color:${P.soft};margin:12px auto 0;max-width:420px;">books we couldn&rsquo;t stop folding the corners of &mdash; chosen by real booksellers, with a few from claude for your shelf.</div>
  </td></tr>

  ${label('from the booksellers')}
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${staff}<tr><td style="border-top:1px dashed ${P.dash};font-size:0;">&nbsp;</td></tr></table></td></tr>

  ${claudeBlock}

  <tr><td align="center" style="padding-top:44px;">
    <div style="font-family:${HAND};font-weight:600;font-size:20px;color:${P.soft};">new picks every month &mdash; fetch them while they&rsquo;re warm.</div>
    <div style="font-family:${SANS};font-size:13px;color:${P.faint};margin-top:10px;">dog ear &middot; a little library on the internet &middot; <a href="https://dogear.bar" style="color:${P.caramel};">dogear.bar</a></div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`
}

export async function sendDigestEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const key = process.env.SENDGRID_API_KEY
  if (!key) return { ok: false, status: 0, error: 'SENDGRID_API_KEY not set' }
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'amber@intheamber.com', name: 'dog ear' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  })
  if (!res.ok) return { ok: false, status: res.status, error: await res.text() }
  return { ok: true, status: res.status }
}
