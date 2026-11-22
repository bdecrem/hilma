// ola-skillcue: opencode plugin (V2 API) in every workspace image, at /opt/ola/plugins/ola-skillcue, named by the
// system config (/etc/opencode/opencode.jsonc), and in the Mac's local runtime (OlaKit LocalServer.installPlugins).
//
// What it does (OLA-284): when the person's newest request is about publishing ("publish it on ola", "put this
// online", "take it down", "sites.ola.cx", ...), Ola's publish skill is put into the model's system prompt for
// that request, in the same <skill_content> shape the skill tool returns, so the skill is loaded every time it
// applies, whether or not the model would have called the skill tool. opencode's own skill prompt says a skill
// already present this way does not need to be invoked again.
//
// Why: the OLA-230 checker, M4 iMac WebKit try 4 (Nov 20): asked to publish in a cloud project, Ola's model did
// not call the skill tool. It tried Read on "publish.md" (no such file in the project) and Glob with the pattern
// "/opt/ola/skills/publish/**" and no path, which opencode runs inside the project folder, so 0 files (measured
// with opencode 2.3.2: the same pattern with path "/opt/ola/skills/publish" lists the files). It then ran
// `which ola-publish` and `ola-publish --help` and published without the skill's prepare and check.
//
// The skill's text is read from the skills folder beside the plugins folder (../../skills from here): in the image
// /opt/ola/skills, on a Mac ~/Library/Ola/skills (its copy with the paths rewritten for the Mac). Read again when
// SKILL.md changes. Not added when the skill is already in the conversation (the skill tool's result, or this
// note on an earlier step of the same conversation is in the system prompt again anyway). OLA_SKILLCUE=off turns
// it off for one process; OLA_SKILLS_DIR names another skills folder (tests).
//
// It only adds text the model sees. It never blocks a tool, changes a file, or reaches anything outside the
// opencode process.

import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const NOTE_HEAD = '[Ola skill loaded:'
export const NOTE_END = '[end of the skill]'

// Which requests load which skill. Only publish today; a skill joins with its own pattern and a test.
export const CUES = [
  {
    skill: 'publish',
    about: 'publishing',
    when: new RegExp([
      String.raw`\b(?:un)?publish\w*`,
      String.raw`\bsites\.ola\.cx\b`,
      String.raw`\bput (?:\w+ ){0,4}?(?:online|on the (?:web|internet)|up on|up at)\b`,
      String.raw`\bput (?:it|this|that|them|the page|the site|a page) up\b`,
      String.raw`\bput up (?:a|the|our|my|this) (?:page|site|website)\b`,
      String.raw`\b(?:make|making|get|getting) (?:it|this|that|them|the page|the site) (?:live|public)\b`,
      String.raw`\bgo live\b`,
      String.raw`\btake (?:it|this|that|them|the page|the site|our page|my page) (?:down|offline)\b`,
      String.raw`\b(?:host|deploy) (?:it|this)\b|\b(?:host|deploy) (?:our|my|the|this) (?:page|site|website)\b`,
      String.raw`\b(?:a )?link (?:that )?anyone can open\b`,
      String.raw`\b(?:connect|use|buy) (?:a |our |my |the )?(?:own )?domain\b`,
      String.raw`\bon (?:our|my|their) own domain\b`,
    ].join('|'), 'i'),
  },
]

/** The text of the newest message the person typed. */
export function newestRequest(messages) {
  for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role !== 'user') continue
    const c = m.content
    const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p?.type === 'text' && typeof p.text === 'string').map((p) => p.text).join('\n') : ''
    if (text.trim() && !text.includes(NOTE_HEAD)) return text
  }
  return ''
}

/** The skills a request calls for, by id. */
export function cuesFor(request) {
  const r = String(request ?? '')
  return CUES.filter((c) => c.when.test(r))
}

/** Whether the conversation already holds the skill's text (the skill tool's result). */
export function alreadyLoaded(messages, id) {
  let s = ''
  try { s = JSON.stringify(messages ?? []) } catch { return false }
  return s.includes(`<skill_content name="${id}">`) || s.includes(`<skill_content name=\\"${id}\\">`)
}

const cache = new Map() // file -> { stamp, note }

export function skillsDir(env = process.env) {
  return env.OLA_SKILLS_DIR || path.resolve(HERE, '../../skills')
}

/** The note for one skill, or null when its SKILL.md cannot be read. */
export function noteFor(id, env = process.env, about = id) {
  const dir = path.join(skillsDir(env), id)
  const file = path.join(dir, 'SKILL.md')
  let stamp
  try { const s = statSync(file); stamp = `${s.size}:${s.mtimeMs}` } catch { return null }
  const hit = cache.get(file)
  if (hit && hit.stamp === stamp) return hit.note
  let text
  try { text = readFileSync(file, 'utf8') } catch { return null }
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
  if (!body) return null
  const note = [
    `${NOTE_HEAD} ${id}] The person's request is about ${about}, so Ola's \`${id}\` skill is loaded here for this request: it is the same text the skill tool returns. Do not call the skill tool for it, and do not look for its files with Read, Glob or the shell. Follow it from its first step.`,
    `<skill_content name="${id}">`,
    `# Skill: ${id}`,
    '',
    body,
    '',
    `Base directory for this skill: ${dir}`,
    'Relative paths in this skill (e.g., scripts/, references/) are relative to this base directory.',
    '</skill_content>',
    NOTE_END,
  ].join('\n')
  cache.set(file, { stamp, note })
  return note
}

export function onContext(event, env = process.env) {
  if (String(env.OLA_SKILLCUE ?? '').toLowerCase() === 'off') return
  if (!Array.isArray(event?.system)) return
  const request = newestRequest(event.messages)
  if (!request) return
  for (const { skill: id, about } of cuesFor(request)) {
    if (alreadyLoaded(event.messages, id)) continue
    if (event.system.some((p) => p?.text?.startsWith?.(`${NOTE_HEAD} ${id}]`))) continue
    const note = noteFor(id, env, about)
    if (note) event.system.push({ type: 'text', text: note })
  }
}

/** For tests: forget the read skills. */
export function reset() { cache.clear() }

export default {
  id: 'ola-skillcue',
  async setup(ctx) {
    await ctx.session.hook('context', (ev) => onContext(ev))
  },
}
