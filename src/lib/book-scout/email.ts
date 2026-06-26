// Renders + sends the Book Scout monthly digest email. Used by the
// /api/book-scout/digest endpoint so the cloud agent never needs local secrets.

export type BookSrc = { name: string; said: string }
export type Book = {
  title: string
  author: string
  pub_date: string
  one_line: string
  sources: BookSrc[]
}
// AI-curated picks based on the reader's own fiction library.
export type ClaudePick = {
  title: string
  author: string
  pub_date: string
  one_line: string
  why: string // why it fits this reader's taste
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function kindleLink(b: { title: string; author: string }): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(`${b.title} ${b.author}`)}&i=digital-text`
}

// Dog-Ear palette (kept in step with the web page).
const P = {
  paper: '#f3ead7', card: '#fbf6e9', ink: '#231d15', soft: '#6f6552', faint: '#9c9078',
  rule: '#d8c8a8', red: '#b03a26', redInk: '#8f2f1f', blue: '#28425e',
}
const MONO = "'Courier New', Courier, monospace"
const SERIF = "Georgia, 'Times New Roman', serif"

const stamp = (b: { title: string; author: string }, color: string) =>
  `<a href="${kindleLink(b)}" style="display:inline-block;margin-top:13px;font-family:${MONO};font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${color};text-decoration:none;border:1.5px solid ${color};padding:7px 12px;border-radius:2px;">Find on Kindle &rarr;</a>`

const divider = (label: string, sub: string, color: string) =>
  `<tr><td style="padding:34px 0 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${color};white-space:nowrap;padding-right:12px;">${esc(label)}</td>
    <td style="width:100%;border-bottom:1.5px solid ${color};opacity:.4;font-size:0;">&nbsp;</td>
    <td style="font-family:${MONO};font-size:11px;letter-spacing:1px;color:${P.faint};white-space:nowrap;padding-left:12px;">${esc(sub)}</td>
  </tr></table></td></tr>`

export function buildDigestHtml(
  books: Book[],
  monthLabel: string,
  genre: string,
  sourceNames: string[],
  claudePicks: ClaudePick[] = [],
): string {
  const bookCard = (b: Book) => {
    const notes = b.sources
      .map(
        (s) => `<div style="margin-top:11px;padding-left:14px;border-left:2px solid ${P.red};">
        <div style="font-family:${MONO};font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:${P.redInk};">${esc(s.name)}</div>
        <div style="font-size:15px;font-style:italic;color:#3a342d;margin-top:3px;line-height:1.45;">&ldquo;${esc(s.said.replace(/^["“”]|["“”]$/g, ''))}&rdquo;</div>
      </div>`,
      )
      .join('')
    return `<tr><td style="padding:20px 0;border-bottom:1px solid ${P.rule};">
      <div style="font-family:${SERIF};font-size:21px;font-weight:700;color:${P.ink};line-height:1.2;">${esc(b.title)}</div>
      <div style="font-family:${MONO};font-size:12px;letter-spacing:.5px;color:${P.soft};margin-top:5px;">${esc(b.author.toUpperCase())} &middot; ${esc(b.pub_date)}</div>
      <div style="font-family:${SERIF};font-size:16px;color:#36302a;margin-top:11px;line-height:1.5;">${esc(b.one_line)}</div>
      ${notes}
      ${stamp(b, P.red)}
    </td></tr>`
  }

  const pickCard = (p: ClaudePick) =>
    `<tr><td style="padding:20px 0;border-bottom:1px solid ${P.rule};">
      <div style="font-family:${SERIF};font-size:21px;font-weight:700;color:${P.ink};line-height:1.2;">${esc(p.title)}</div>
      <div style="font-family:${MONO};font-size:12px;letter-spacing:.5px;color:${P.soft};margin-top:5px;">${esc(p.author.toUpperCase())} &middot; ${esc(p.pub_date)}</div>
      <div style="font-family:${SERIF};font-size:16px;color:#36302a;margin-top:11px;line-height:1.5;">${esc(p.one_line)}</div>
      <div style="margin-top:11px;padding-left:14px;border-left:2px solid ${P.blue};">
        <div style="font-family:${MONO};font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:${P.blue};">Why it&rsquo;s on your shelf</div>
        <div style="font-family:${SERIF};font-size:15px;color:#3a342d;margin-top:3px;line-height:1.45;">${esc(p.why)}</div>
      </div>
      ${stamp(p, P.blue)}
    </td></tr>`

  const claudeBlock = `
    ${divider('Claude Code Picks', `${claudePicks.length} · from your shelf`, P.blue)}
    <tr><td style="font-family:${MONO};font-size:11.5px;color:${P.faint};line-height:1.5;padding-bottom:2px;">Claude&rsquo;s own picks, read off your fiction library &mdash; recent, available, and not already yours.</td></tr>
    ${claudePicks.length
      ? `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${claudePicks.map(pickCard).join('')}</table></td></tr>`
      : `<tr><td style="padding-top:12px;"><div style="font-family:${MONO};font-size:13px;color:${P.soft};border:1.5px dashed ${P.rule};border-radius:3px;padding:14px;line-height:1.5;">None on this issue yet &mdash; Claude sets these at the start of each month from your shelf.</div></td></tr>`}`

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:${P.paper};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${P.paper};">
<tr><td align="center" style="padding:26px 14px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${P.card};border:1.5px solid ${P.rule};border-radius:3px;padding:30px 28px;">
  <tr><td style="border-bottom:2px solid ${P.ink};padding-bottom:16px;">
    <div style="font-family:${MONO};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${P.red};">A reading list</div>
    <div style="font-family:${SERIF};font-size:46px;font-weight:700;color:${P.ink};line-height:1;margin-top:2px;">Dog-Ear</div>
    <div style="font-family:${SERIF};font-size:16px;font-style:italic;color:${P.soft};margin-top:11px;line-height:1.45;">New books worth folding down a corner for &mdash; chosen by real critics and booksellers, with a few from Claude based on your own shelf.</div>
  </td></tr>
  <tr><td style="font-family:${MONO};font-size:12px;letter-spacing:1px;color:${P.soft};padding-top:14px;">${esc(monthLabel.toUpperCase())} &middot; ${esc(genre.toUpperCase())}</td></tr>

  ${divider('Staff Picks', `${books.length} · on Kindle now`, P.red)}
  <tr><td style="font-family:${MONO};font-size:11.5px;color:${P.faint};line-height:1.5;padding-bottom:2px;">Recommended by real critics &amp; booksellers &mdash; never by an algorithm.</td></tr>
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${books.map(bookCard).join('')}</table></td></tr>

  ${claudeBlock}

  <tr><td style="padding-top:26px;margin-top:8px;border-top:2px solid ${P.ink};">
    <div style="font-family:${MONO};font-size:11px;letter-spacing:.5px;color:${P.faint};line-height:1.7;">
      Sources: ${esc(sourceNames.join(', '))}.<br>
      Dog-Ear &middot; <a href="https://feynd.cc/book-scout" style="color:${P.red};">feynd.cc/book-scout</a>
    </div>
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
      from: { email: 'amber@intheamber.com', name: 'Dog-Ear' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  })
  if (!res.ok) return { ok: false, status: res.status, error: await res.text() }
  return { ok: true, status: res.status }
}
