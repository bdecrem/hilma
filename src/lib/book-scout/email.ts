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

const kbtn = (b: { title: string; author: string }) =>
  `<a href="${kindleLink(b)}" style="display:inline-block;margin-top:12px;font-size:14px;font-weight:600;color:#fff;background:#c2683a;text-decoration:none;padding:8px 14px;border-radius:6px;">Find on Kindle →</a>`

export function buildDigestHtml(
  books: Book[],
  monthLabel: string,
  genre: string,
  sourceNames: string[],
  claudePicks: ClaudePick[] = [],
): string {
  const cards = books
    .map((b, i) => {
      const sources = b.sources
        .map(
          (s) => `<div style="margin-top:8px;padding-left:12px;border-left:3px solid #d9c7a3;">
       <div style="font-size:13px;color:#6b6256;font-weight:600;">${esc(s.name)}</div>
       <div style="font-size:14px;color:#3a352c;margin-top:2px;">${esc(s.said)}</div>
     </div>`,
        )
        .join('')
      return `
  <tr><td style="padding:22px 0;border-top:${i === 0 ? 'none' : '1px solid #ece4d3'};">
    <div style="font-size:19px;font-weight:700;color:#241f17;line-height:1.3;">${esc(b.title)}</div>
    <div style="font-size:14px;color:#8a7f6d;margin-top:2px;">${esc(b.author)} &nbsp;·&nbsp; ${esc(b.pub_date)}</div>
    <div style="font-size:15px;color:#4a4438;margin-top:10px;line-height:1.5;">${esc(b.one_line)}</div>
    ${sources}
    ${kbtn(b)}
  </td></tr>`
    })
    .join('')

  const picks = claudePicks
    .map(
      (p, i) => `
  <tr><td style="padding:20px 0;border-top:${i === 0 ? 'none' : '1px solid #ece4d3'};">
    <div style="font-size:18px;font-weight:700;color:#241f17;line-height:1.3;">${esc(p.title)}</div>
    <div style="font-size:14px;color:#8a7f6d;margin-top:2px;">${esc(p.author)} &nbsp;·&nbsp; ${esc(p.pub_date)}</div>
    <div style="font-size:15px;color:#4a4438;margin-top:8px;line-height:1.5;">${esc(p.one_line)}</div>
    <div style="margin-top:8px;padding-left:12px;border-left:3px solid #b9c4a0;">
      <div style="font-size:13px;color:#5c6b4e;font-weight:600;">Why it fits your shelf</div>
      <div style="font-size:14px;color:#3a352c;margin-top:2px;">${esc(p.why)}</div>
    </div>
    ${kbtn(p)}
  </td></tr>`,
    )
    .join('')

  const claudeSection = claudePicks.length
    ? `
  <tr><td style="padding-top:28px;">
    <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5c6b4e;font-weight:700;">Claude Code Picks</div>
    <div style="font-size:15px;color:#6b6256;margin-top:6px;line-height:1.5;">
      ${claudePicks.length} books chosen by Claude from your own reading — recent, available now, and not already on your shelf. (These are AI picks, clearly labelled as such.)
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;">${picks}</table>
  </td></tr>`
    : ''

  const capGenre = genre.charAt(0).toUpperCase() + genre.slice(1)
  return `<!doctype html><html><body style="margin:0;background:#faf6ec;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6ec;">
<tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffdf7;border-radius:12px;padding:30px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr><td>
    <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#c2683a;font-weight:700;">Book Scout</div>
    <div style="font-size:26px;font-weight:800;color:#241f17;margin-top:4px;">${esc(capGenre)} — ${esc(monthLabel)}</div>
    <div style="font-size:15px;color:#6b6256;margin-top:10px;line-height:1.5;">
      ${books.length} books picked by critics, booksellers and librarians — <b>not by AI</b>. Every one is published and on Kindle right now. Tap a title's button to open its Kindle search.
    </div>
  </td></tr>
  <tr><td>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}</table>
  </td></tr>
  ${claudeSection}
  <tr><td style="padding-top:24px;border-top:1px solid #ece4d3;">
    <div style="font-size:13px;color:#8a7f6d;line-height:1.6;">
      Sources this month: ${esc(sourceNames.join(', '))}.<br>
      Manage genre + sources at <a href="https://feynd.cc/book-scout" style="color:#c2683a;">feynd.cc/book-scout</a>.
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
      from: { email: 'amber@intheamber.com', name: 'Book Scout' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  })
  if (!res.ok) return { ok: false, status: res.status, error: await res.text() }
  return { ok: true, status: res.status }
}
