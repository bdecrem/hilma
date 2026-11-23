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
// 2.0.0 (OLA-421): also the standing rule that applies to a request (RULES below: Claude on the Mac, something
// on a schedule, a real-world sound), and "a link to this page I can send" counts as a request to publish.
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
      // OLA-421: "can you give me a link to this page that I can send to my group" loaded nothing, and Ola
      // answered from an old publish record with an address that was 404.
      String.raw`\b(?:give|get|send|share|make)\b(?: \w+){0,3}? (?:a |the )?(?:public |shareable |sharable |web )?link\b`,
      String.raw`\blink to (?:this|the|my|our|that|their) (?:page|site|website|flyer|poster)\b`,
      String.raw`\bshar(?:e|eable|able) link\b`,
      String.raw`\b(?:connect|use|buy) (?:a |our |my |the )?(?:own )?domain\b`,
      String.raw`\bon (?:our|my|their) own domain\b`,
    ].join('|'), 'i'),
  },
]

// Rules for a request (OLA-421, 2.0.0). Three of Ola's standing rules (workspace/AGENTS.md, OlaKit Abilities.swift,
// both written from evals/asks/abilities.json) were followed about half the time when they sat only in the long
// instructions: in the request tests of Nov 23 Ola on the Mac wrote hello.txt itself when asked to "have claude
// code do this one" (0 of 2; it had passed 2 of 3 the run before), answered "every monday morning, check the city
// council agenda" without the sentence it is given (and on Nov 23 03:08 in a cloud project promised to "look it
// up each Monday morning"), and opened the birdsong page's reply with "The page is done and the sound check
// passed". The rule that applies is now put in the system prompt of that request, on every step, like a skill
// above. Each one is worded for the case it fits, so a request it matched by accident is told nothing false.
export const RULE_HEAD = '[Ola rule for this request:'

// abilities.json's `notOffered` sentence for "schedule", word for word (skillcue.test.mjs keeps them equal).
export const SCHEDULE_SENTENCE = 'Ola can\'t do things on a schedule or later by itself: it works when you ask. Ask me again then and I will do it.'

// The cloud's web server puts the fact about Claude in this project in front of such a request
// (frontdesk/claude.mjs claudeNote); that fact is followed, and this rule stays out.
export const CLAUDE_FACT = 'About Claude in this project (from the app'
// The same pattern as the web server's (frontdesk/claude.mjs NAMES_CLAUDE), copied: the plugin is its own
// folder in the image. skillcue.test.mjs keeps them equal.
export const NAMES_CLAUDE = /\b(?:have|ask|let|get|use|try|want|need|prefer|switch to|hand (?:it |this |that )?(?:over )?to|send (?:it |this |that )?to|give (?:it |this |that )?to)\s+claude\b|\bclaude(?: code)?,?\s+(?:(?:can|could|should|would|will|to|please)\s+)?(?:do|handle|take|build|make|write|fix|try|finish)\b/i

const DAYS = '(?:mon|tues|wednes|thurs|fri|satur|sun)day'
const WHEN = new RegExp([
  String.raw`\b(?:every|each)\s+(?:other\s+)?(?:${DAYS}s?|day|morning|afternoon|evening|night|week|weekday|weekend|month|year|hour|quarter|\d+\s+(?:minutes?|hours?|days?|weeks?|months?))\b`,
  String.raw`\b${DAYS}s\b`,
  String.raw`\b(?:daily|weekly|monthly|hourly|nightly)\b`,
  String.raw`\bremind (?:me|us)\b`,
  String.raw`\bkeep (?:an eye on|checking|watching|track of)\b`,
  String.raw`\bon a (?:schedule|timer)\b|\bschedule (?:it|this|that|a|the)\b`,
  String.raw`\b(?:later today|tomorrow (?:morning|afternoon|evening|at)|tonight at|next (?:${DAYS}|week|month) (?:morning|at)|in (?:an?|one|two|three|\d+) (?:hours?|minutes?|days?|weeks?))\b`,
].join('|'), 'i')
// Something done by Ola then, not a schedule written into a page ("a page for our weekly meeting").
const DO_THEN = /\b(?:check|look (?:at|up|for|into)|tell (?:me|us)|let (?:me|us) know|send|remind|watch|monitor|e-?mail|text|post|tweet|run|notify|alert|scan|search|fetch|download|summari[sz]e|report|update (?:me|us)|ping)\b/i

// A real-world sound: what Ola can only come close to in code.
const REAL_SOUND = /\bbird ?songs?\b|\bbirds? (?:singing|chirping|calls?|sounds?|tweeting)\b|\b(?:chirp|tweet|song)(?:s|ing)? of (?:a |the )?birds?\b|\b(?:sounds? of|recording of|real) (?:rain|thunder|waves|the ocean|the sea|wind|a river|a stream|birds?|a dog|dogs|a cat|cats|a crowd|people|a voice|someone)\b|\b(?:rain|thunder|ocean|wave|wind|nature|forest|crowd|cheering|applause|barking|meowing|frog|cricket|whale) (?:sounds?|noises?)\b|\b(?:recorded|real) (?:sound|voice|audio)\b|\bsays? (?:it )?(?:out loud|aloud)\b|\b(?:a |in a )?voice (?:that )?(?:says|reads|saying|reading)\b/i
const SOUNDING = /\b(?:plays?|playing|sounds?|audio|hear|noises?|music|tune|tap|click|press|button|aloud|loud|voice)\b/i

export const RULES = [
  {
    id: 'claude',
    when: (r) => NAMES_CLAUDE.test(r) && !r.includes(CLAUDE_FACT),
    text: 'The person asked for Claude (Claude Code) to do this request. Do not do it yourself: write, change or delete no file for it and run nothing for it. ' +
      'Tell them, in one or two plain sentences, to type /claude followed by the request (for example "/claude <their request>"), or to turn on Fallback to Claude in Settings. ' +
      'Never say you cannot hand it over. If you offer to do it yourself instead, do it only after they say yes.',
  },
  {
    id: 'schedule',
    when: (r) => WHEN.test(r) && DO_THEN.test(r),
    text: 'If the person asks you to do something by yourself on a schedule or later (every Monday, each morning, remind me tomorrow), and not only to write a schedule into a page or a document: Ola cannot do that. ' +
      `Put this sentence in your reply, word for word (in the person's language if they write in another): "${SCHEDULE_SENTENCE}" ` +
      'Then do the part you can now, or ask the one thing you need for it. Never say or imply that you will do it later, every week or on any schedule.',
  },
  {
    id: 'real-sound',
    when: (r) => REAL_SOUND.test(r) && SOUNDING.test(r),
    text: 'If the person asked for a real-world sound (birdsong, rain, waves, an animal, a voice, a recording of anything): every sound Ola makes is made in code and only comes close. ' +
      'The first sentence of your final reply says so, before anything about the page, the checks or the files, in about these words: "I can\'t use a recording; this is a sound made in code that comes close to <the sound>." ' +
      'Never say it is exactly what they asked, and label the button or the page for what it really plays (a bird-like tune, not birdsong).',
  },
]

/** The rules a request calls for, by id. */
export function rulesFor(request) {
  const r = String(request ?? '')
  return RULES.filter((x) => x.when(r))
}

export const ruleNote = (rule) => `${RULE_HEAD} ${rule.id}] ${rule.text}`

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
  // OLA-421: the standing rule that applies to this request, on every step of it.
  for (const rule of rulesFor(request)) {
    if (event.system.some((p) => p?.text?.startsWith?.(`${RULE_HEAD} ${rule.id}]`))) continue
    event.system.push({ type: 'text', text: ruleNote(rule) })
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
