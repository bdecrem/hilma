// node --test workspace/plugins/ola-skillcue/skillcue.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cuesFor, onContext, noteFor, alreadyLoaded, reset, NOTE_HEAD, NOTE_END } from './index.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SKILLS = path.resolve(HERE, '../../../skills')
const env = { OLA_SKILLS_DIR: SKILLS }
const ids = (r) => cuesFor(r).map((c) => c.skill)

// Every request to publish that a person or a checker typed (evals/asks/cases.json, the publish ability), and
// the phrases the skill's own description names.
const cases = JSON.parse(readFileSync(path.resolve(HERE, '../../../evals/asks/cases.json'), 'utf8')).cases
const PUBLISH = [
  'make a page that says Bart and publish it on ola',
  'put up a page on ola that just says Hazel',
  'publish it again',
  'publish this',
  'Publish the flyer',
  'put this online',
  'can you put the page online for us',
  'make it live',
  'take it down',
  'unpublish it',
  'put it on sites.ola.cx',
  'share it with a link anyone can open',
  'host our page',
  'deploy the site',
  'connect our domain',
  'get it on our own domain',
]
const NOT = [
  'make the heading say Willow instead',
  'change the page so it says Aspen',
  'summarize these meeting minutes',
  'build me a to-do app where each task has a due date',
  'make a chart of studies per region',
  'who made index.html',
  'write a two-page brief as a Word document',
]

test('requests to publish load the publish skill', () => {
  for (const r of PUBLISH) assert.deepEqual(ids(r), ['publish'], r)
})

test('requests that are not about publishing load nothing (a change to a published page is not a request to publish it)', () => {
  for (const r of NOT) assert.deepEqual(ids(r), [], r)
})

test('every kept request test of the publish ability whose last request asks to publish loads it; change-only cases do not', () => {
  for (const c of cases.filter((c) => c.ability === 'publish')) {
    const last = c.say
    const changeOnly = (c.mustNot ?? []).concat(c.must ?? []).some((m) => /^noran:ola-publish/.test(m))
    if (changeOnly) assert.deepEqual(ids(last), [], `${c.id}: ${last}`)
  }
  assert.deepEqual(ids(cases.find((c) => c.id === 'publish-bart').say), ['publish'])
})

test('the note is the skill itself, in the skill tool shape, without its frontmatter, with the base directory', () => {
  reset()
  const n = noteFor('publish', env, 'publishing')
  const skill = readFileSync(path.join(SKILLS, 'publish/SKILL.md'), 'utf8')
  assert.ok(n.startsWith(`${NOTE_HEAD} publish]`))
  assert.ok(n.endsWith(NOTE_END))
  assert.ok(n.includes('<skill_content name="publish">') && n.includes('</skill_content>'))
  assert.ok(n.includes('# Publish a page, for real'))
  assert.ok(n.includes('python3 /opt/ola/skills/publish/scripts/publish.py where'))
  assert.ok(!n.includes('ola/version'), 'frontmatter left out')
  assert.ok(n.includes(`Base directory for this skill: ${path.join(SKILLS, 'publish')}`))
  // the whole body, not a part of it
  const body = skill.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
  assert.ok(n.includes(body))
})

test('onContext adds the note once, only for a publish request, and not when the skill tool already loaded it', () => {
  const ev = (text, extra = []) => ({ system: [{ type: 'text', text: 'base' }], messages: [...extra, { role: 'user', content: [{ type: 'text', text }] }], sessionID: 's' })
  const a = ev('make a page that says Bart and publish it on ola')
  onContext(a, env)
  assert.equal(a.system.length, 2)
  assert.ok(a.system[1].text.includes('<skill_content name="publish">'))
  onContext(a, env)
  assert.equal(a.system.length, 2, 'not twice')
  const b = ev('summarize these meeting minutes')
  onContext(b, env)
  assert.equal(b.system.length, 1)
  const loaded = [{ role: 'tool', content: [{ type: 'tool-result', output: '<skill_content name="publish">\n# Skill: publish' }] }]
  const c = ev('publish it', loaded)
  assert.ok(alreadyLoaded(c.messages, 'publish'))
  onContext(c, env)
  assert.equal(c.system.length, 1, 'already loaded by the skill tool')
  const d = ev('publish it')
  onContext(d, { ...env, OLA_SKILLCUE: 'off' })
  assert.equal(d.system.length, 1, 'OLA_SKILLCUE=off')
  const e = ev('publish it')
  onContext(e, { OLA_SKILLS_DIR: '/nonexistent' })
  assert.equal(e.system.length, 1, 'no skills folder: no note, no error')
})

test('every cue names a skill that exists', async () => {
  const { CUES } = await import('./index.js')
  const have = new Set(readdirSync(SKILLS))
  for (const c of CUES) assert.ok(have.has(c.skill), c.skill)
})
