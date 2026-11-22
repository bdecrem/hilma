// Ola's cards, described once (OLA-325). A question Ola asks (opencode's `question` tool raises a
// form) and the yes asked before publishing (or taking pages down) become one plain description
// here: every sentence the card shows, its choices, its buttons, and what words typed in the
// conversation's box do. The web app imports this module; the Mac and iPhone apps run this same
// file in JavaScriptCore (OlaKit CardsJS.swift is generated from it by apple/tools/cards-js.mjs, and
// a test refuses a copy that differs). Each client only draws what it is given.
//
// Why: six card tickets on Nov 20 were one card drawn differently in one client (a two-question
// card left only Stop beside the box on the website; the apps ignored typed words for it; the
// publish yes showed a raw command on the Mac). One description, and one set of fixtures
// (web/test/cards.fixtures.json) that the web check and OlaKit's tests both render.
//
// Plain JavaScript with no imports but the two parsers below, so the apps can load it as a script.
import { shellWords } from './webask.mjs'
import { publishAskOf } from './publishask.mjs'

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
/** "three files", "one file" (the same as web/src/lib/format.ts count). */
export function cardCount(n, one, many = `${one}s`) {
  return `${n < 10 ? NUMBERS[n] : n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

/** The publish yes for n files ("Publish this file", "Publish these three files"), "again" when the address already shows them. */
export function publishYes(n, again = false) {
  return `Publish ${n === 1 ? 'this file' : `these ${cardCount(n, 'file')}`}${again ? ' again' : ''}`
}

/** "12 KB" (the same as web/src/lib/format.ts bytes). */
export function cardBytes(n) {
  if (n < 1000) return `${n} bytes`
  if (n < 1000 * 1000) return `${Math.round(n / 1000)} KB`
  if (n < 1000 * 1000 * 1000) return `${(n / 1000 / 1000).toFixed(1)} MB`
  return `${(n / 1000 / 1000 / 1000).toFixed(1)} GB`
}

const PUBLIC = 'These files will be public: anyone with the address can open them, and search engines may find them.'

// ---------------------------------------------------------------- the question card

/**
 * A form from opencode as the card: null when it is not one a person can answer here.
 * { kind: 'question', id, sessionID, stepID, kicker, fields, tapAnswers, send, boxNote, sent }
 * - fields: { key, title, text, options: [{ value, label, description }], custom, multiple, placeholder }
 * - tapAnswers: one field, one choice: a tap on a choice is the whole answer (no Send button)
 * - boxNote: the sentence that says what words typed in the box do (they answer the whole card)
 */
export function questionCard(form) {
  if (!form || typeof form.id !== 'string' || !Array.isArray(form.fields)) return null
  const fields = form.fields
    .filter((f) => f && typeof f.key === 'string' && (f.type === 'string' || f.type === 'multiselect'))
    .map((f) => {
      const options = (Array.isArray(f.options) ? f.options : []).filter((o) => o && typeof o.value === 'string').map((o) => ({ value: o.value, label: String(o.label ?? o.value), description: o.description ? String(o.description) : null }))
      return {
        key: f.key,
        title: String(f.title ?? ''),
        text: String(f.description || f.title || ''),
        options,
        custom: f.custom !== false,
        multiple: f.type === 'multiselect',
        placeholder: options.length ? 'Or say it in your own words' : 'Your answer',
      }
    })
  if (!fields.length) return null
  const tapAnswers = fields.length === 1 && !fields[0].multiple
  const n = fields.length
  const boxNote =
    n > 1
      ? `Or write one answer in the box below. Ola gets your words as your answer to ${n === 2 ? 'both questions' : `all ${n < 10 ? NUMBERS[n] : n} questions`}.`
      : fields[0].options.length
        ? 'Or write your own answer in the box below.'
        : 'Write your answer in the box below.'
  return {
    kind: 'question',
    id: form.id,
    sessionID: String(form.sessionID ?? ''),
    stepID: form.metadata?.tool?.id ?? null,
    kicker: 'Ola is asking you, and waits for your answer',
    fields,
    tapAnswers,
    send: tapAnswers ? null : 'Send my answers',
    boxNote,
    sent: 'Sent. Ola carries on.',
  }
}

/** Words typed in the box as the answer to the whole card: each question gets them (a list for a pick-several one). Null when there are no words. */
export function answerFromWords(card, words) {
  const w = String(words ?? '').trim()
  if (!w || !card?.fields?.length) return null
  return Object.fromEntries(card.fields.map((f) => [f.key, f.multiple ? [w] : w]))
}

// ---------------------------------------------------------------- the publish yes

const LOCAL_TOOL = /(^|\/)ola-publish$/

/**
 * The Mac's own command (local runtime, apps/activist-ai/bart/ola-publish):
 *   ola-publish publish <folder> --name <name> --fingerprint <fp> [--json]
 *   ola-publish unpublish --name <name> [--json]
 * also after `cd <dir> &&` and with `2>&1` at the end. { publish: { folder, name } } |
 * { unpublish: { name } } | null.
 */
export function localPublishOf(cmd) {
  let c = String(cmd ?? '').trim().replace(/\s+2>&1$/, '')
  let base = null
  const cd = /^cd\s+(\S+)\s*&&\s*/.exec(c)
  if (cd) {
    base = cd[1].replace(/^["']|["']$/g, '')
    c = c.slice(cd[0].length)
  }
  const w = shellWords(c)
  if (!w || w.length < 2 || !LOCAL_TOOL.test(w[0]) || (w[1] !== 'publish' && w[1] !== 'unpublish')) return null
  let folder = null
  let name = null
  for (let i = 2; i < w.length; i++) {
    if (w[i] === '--name' && i + 1 < w.length) name = w[++i]
    else if (w[i] === '--fingerprint' && i + 1 < w.length) i++
    else if (w[i] === '--json') continue
    else if (w[i].startsWith('-') || folder !== null) return null
    else folder = w[i]
  }
  if (!name) return null
  if (w[1] === 'unpublish') return folder === null ? { unpublish: { name } } : null
  if (!folder) return null
  if (base && !folder.startsWith('/')) folder = folder === '.' ? base : `${base.replace(/\/+$/, '')}/${folder.replace(/^\.\//, '')}`
  return { publish: { folder: folder.replace(/\/+$/, '') || '.', name } }
}

/**
 * A permission request that puts pages on the public web, or takes them down, as its card; null
 * for any other request (the client describes it as before). `ctx`:
 *   address  the cloud project's address, "sites.ola.cx/<project>/" (default "sites.ola.cx")
 *   files    for the Mac's own command: the files in the folder, as ola-publish sends them (the
 *            app lists them on the Mac; this module never reads a disk)
 * { kind: 'publish', runtime, title, lede, address, heading, files, yes, no, always: false, sel? }
 * { kind: 'unpublish', runtime, title, lede, address, files: [], yes, no, always: false }
 * The yes is for exactly this list, once: there is never a "for the rest of this conversation".
 */
export function publishCard(action, resources, ctx = {}) {
  if (action !== 'shell' && action !== 'bash') return null
  const list = Array.isArray(resources) ? resources : []
  if (list.length !== 1) return null
  const cloud = publishAskOf(action, list)
  if (cloud?.sel) {
    const files = cloud.files
    const address = ctx.address || 'sites.ola.cx'
    return {
      kind: 'publish',
      runtime: 'cloud',
      title: 'Ola wants to publish this on the web',
      lede: `${PUBLIC} Nothing else in the project leaves Ola’s computer.`,
      address,
      heading: `${cardCount(files.length, 'file')} will be public`,
      files,
      yes: publishYes(files.length),
      no: 'Not now',
      always: false,
      sel: cloud.sel,
      checking: 'Looking at the files and checking them for passwords and private data…',
    }
  }
  if (cloud?.unpublish) {
    const address = ctx.address || 'sites.ola.cx'
    return { kind: 'unpublish', runtime: 'cloud', title: 'Ola wants to take this project’s pages off the web', lede: 'Nothing will be at this project’s address on the web any more. The files stay in the project.', address, heading: null, files: [], yes: 'Yes, take it down', no: 'Not now', always: false }
  }
  const local = localPublishOf(list[0])
  if (local?.publish) {
    const files = Array.isArray(ctx.files) ? ctx.files.filter((f) => typeof f === 'string') : []
    const address = `sites.ola.cx/${local.publish.name}/`
    return {
      kind: 'publish',
      runtime: 'local',
      title: 'Ola wants to publish this on the web',
      lede: `${PUBLIC} Nothing else on this Mac goes with them.`,
      address,
      heading: files.length ? `${cardCount(files.length, 'file')} will be public` : `Everything in ${local.publish.folder} will be public`,
      files,
      yes: files.length ? publishYes(files.length) : 'Publish the folder',
      no: 'Not now',
      always: false,
      folder: local.publish.folder,
    }
  }
  if (local?.unpublish) {
    const address = `sites.ola.cx/${local.unpublish.name}/`
    return { kind: 'unpublish', runtime: 'local', title: `Ola wants to take ${address} off the web`, lede: `Nothing will be at ${address} any more. The files stay on this Mac.`, address, heading: null, files: [], yes: 'Yes, take it down', no: 'Not now', always: false }
  }
  return null
}

/**
 * A cloud publish card with the front desk's own look at the files (GET /api/site/preview: the
 * list that would go public, sizes, what is left out, warnings, the fingerprint of the list): what
 * the website's sheet and the apps' card show once the check is back, and the yes for exactly
 * that list (OLA-325: the Mac card had left out the sizes, the left-out line and the warnings).
 * `plan`: { url, items: [{ as, size, uploaded }], total, leftOut: [], warnings: [], acceptableUse, fingerprint, published }
 */
export function publishWithPlan(card, plan) {
  if (!card || card.kind !== 'publish' || !plan || !Array.isArray(plan.items)) return card
  const items = plan.items.filter((i) => i && typeof i.as === 'string')
  const left = Array.isArray(plan.leftOut) ? plan.leftOut.length : 0
  return {
    ...card,
    address: String(plan.url ?? card.address).replace(/^https?:\/\//, ''),
    heading: `${cardCount(items.length, 'file')} will be public, ${cardBytes(Number(plan.total) || 0)}`,
    files: items.map((i) => i.as),
    fileNotes: items.map((i) => `${cardBytes(Number(i.size) || 0)}${i.uploaded ? ' · added by your group' : ''}`),
    leftOut: left ? `Left out: ${cardCount(left, 'hidden or working file')}.` : null,
    warnings: (Array.isArray(plan.warnings) ? plan.warnings : []).map(String),
    aup: plan.acceptableUse ? String(plan.acceptableUse) : null,
    yes: publishYes(items.length, !!plan.published),
    fingerprint: typeof plan.fingerprint === 'string' ? plan.fingerprint : null,
    checking: null,
  }
}

// ---------------------------------------------------------------- what a card shows, in order

/** Every line a card shows, in order: what the check finds on each client's card. */
export function cardLines(card) {
  if (!card) return []
  if (card.kind === 'question') {
    const out = [card.kicker]
    for (const f of card.fields) {
      out.push(f.text || f.title)
      for (const o of f.options) out.push(o.label, ...(o.description ? [o.description] : []))
    }
    out.push(card.boxNote)
    if (card.send) out.push(card.send)
    return out
  }
  if (card.kind !== 'publish') return [card.title, card.lede, card.yes, card.no]
  const files = card.files.flatMap((f, i) => (card.fileNotes ? [f, card.fileNotes[i]] : [f]))
  return [card.title, card.lede, `The address: ${card.address}`, card.heading, ...files, ...(card.leftOut ? [card.leftOut] : []), ...(card.warnings ?? []), ...(card.aup ? [card.aup] : []), card.yes, card.no]
}
