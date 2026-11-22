// What files the project holds, for a request that points at one without naming it (OLA-380).
//
// The checker, Nov 21, on a phone in a new cloud project: flyer-photo.png uploaded with Add files,
// then "whats on this image". Ola answered in 2 s without a step: "You haven't shared an image with
// me yet", and in a second conversation "The folder appears to be empty". Only "what's in the
// picture I just uploaded?" made it look. On the website a file is never attached to a message: it
// is added under Files, and "this image" means a file there. The model read "this image" as an
// attachment it did not get.
//
// So a request that speaks of a picture, a file or an upload by a pointing word ("this image", "the
// photo", "my file", "what I uploaded") and names no file gets, in front of it, the fact of what is
// in the project: the newest files first, the ones the person uploaded marked, or that there are
// none. The fact comes from the front desk's own file list (the same as Files shows), never from the
// workspace's word. It goes into the one note the apps strip (madeby.mjs NOTE_OPEN).

// A pointing word, then within a few words a kind of file; or "I (just) uploaded/added/attached/sent".
export const ASKS_FILE = /\b(?:this|that|these|those|the|my|our|attached|uploaded)\s+(?:\w+\s+){0,2}?(?:image|images|picture|pictures|pic|pics|photo|photos|photograph|screenshot|screenshots|scan|scans|flyer|flyers|poster|file|files|document|documents|doc|docs|pdf|pdfs|upload|uploads|attachment|attachments|spreadsheet|table|csv|recording|audio|video)\b|\b(?:i|we)\s+(?:just\s+|have\s+|’ve\s+|'ve\s+)?(?:uploaded|added|attached|sent|shared|put)\b|\bwhat(?:'s|’s| is)?\s+(?:on|in)\s+(?:it|here)\b/i

// A file name in the request ("flyer.png", "report.pdf"): then the person named it, and Ola can find it.
const NAMES_FILE = /\b[\w-]+\.(?:png|jpe?g|gif|webp|heic|svg|pdf|docx?|xlsx?|csv|txt|md|html?|json|mp3|m4a|wav|mp4|mov|zip)\b/i

const PICTURE = /\.(?:png|jpe?g|gif|webp|heic|heif|svg|bmp|tiff?)$/i
const MAX_NAMED = 8

export function asksAboutFile(text) {
  const t = String(text ?? '')
  return ASKS_FILE.test(t) && !NAMES_FILE.test(t)
}

/** "2 minutes ago", "an hour ago", "on Nov 3": plain words for how long ago. */
export function ago(iso, now = Date.now()) {
  const ms = now - Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const min = Math.round(ms / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return min === 1 ? 'a minute ago' : `${min} minutes ago`
  const h = Math.round(min / 60)
  if (h < 24) return h === 1 ? 'an hour ago' : `${h} hours ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

/** File names as the note quotes them: nothing that closes the note. */
const safe = (p) => String(p).replace(/[<>]/g, '').slice(0, 120)

/**
 * The fact for the note, from Files' own list (entries of fileEntries: path, modified, origin,
 * uploaded). Empty list: says there are none.
 */
export function filesFact(entries, now = Date.now()) {
  const files = (entries ?? []).filter((f) => f && typeof f.path === 'string')
  if (!files.length)
    return 'Files in this project right now: none. The person has not added any file yet (nothing is ever attached to a message here; files are added with Add files under Files). If they ask about a picture or a file, say there is none in the project yet and that they can add it with Add files, then ask again. Do not describe a file you have not opened.'
  const when = (f) => Date.parse(f.uploaded ?? f.modified ?? '') || 0
  const sorted = [...files].sort((a, b) => when(b) - when(a))
  const shown = sorted.slice(0, MAX_NAMED).map((f) => {
    const a = ago(f.uploaded ?? f.modified, now)
    const kind = PICTURE.test(f.path) ? 'a picture, ' : ''
    return `${safe(f.path)} (${kind}${f.origin === 'uploaded' ? 'uploaded by the person' : 'made in the project'}${a ? `, ${a}` : ''})`
  })
  const more = sorted.length - shown.length
  return `Files in this project right now, newest first: ${shown.join('; ')}${more > 0 ? `; and ${more} more` : ''}. Nothing is ever attached to a message here: the person adds files under Files, so "this image", "the photo" or "the file I uploaded" means one of these, the newest that fits. Open it before you answer (for a picture: ola-see, the file name, then the question), and never say they have not shared it or that the folder is empty.`
}
