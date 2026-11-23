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

// OLA-421: the standing rule that applies to a request goes in the system prompt with it.
test('a request for Claude, for something on a schedule and for a real-world sound gets its rule; others get none', async () => {
  const { rulesFor } = await import('./index.js')
  const rules = (r) => rulesFor(r).map((x) => x.id)
  const said = (id) => cases.find((c) => c.id === id).say
  assert.deepEqual(rules(said('ask-claude')), ['claude'])
  assert.deepEqual(rules(said('schedule')), ['schedule'])
  assert.deepEqual(rules(said('birdsong')), ['real-sound'])
  for (const r of ['can you have Claude do this one', 'ask claude to fix the chart', 'Claude, build the page']) assert.deepEqual(rules(r), ['claude'], r)
  for (const r of ['remind me tomorrow at 9 to call the landlord', 'check the county site every week and let me know if the hearing moves', 'send me the totals each friday', 'post this every day']) assert.ok(rules(r).includes('schedule'), r)
  for (const r of ['a page with a button that plays rain sounds', 'make the page play a recording of a dog barking when you tap it', 'birds chirping when you press the button']) assert.deepEqual(rules(r), ['real-sound'], r)
  // a schedule written into a page, a tune, who made a file: nothing
  for (const r of [...NOT, 'make a page for our weekly meeting on mondays', 'make a flyer for the cleanup every saturday', 'make a page with a button that plays a tune', 'was index.html made by claude?', 'who made this, Ola or Claude?']) assert.deepEqual(rules(r), [], r)
  // every kept request: only these three cases get a rule
  const got = cases.flatMap((c) => [...(c.before ?? []), c.say].filter((r) => rules(r).length).map(() => c.id))
  assert.deepEqual([...new Set(got)].sort(), ['address-after-unpublish', 'ask-claude', 'birdsong', 'link-after-unpublish', 'schedule', 'share-link', 'url-after-unpublish'])
})

test('in a cloud project the web server\'s fact about Claude is followed, and the Claude rule stays out', async () => {
  const { rulesFor, CLAUDE_FACT } = await import('./index.js')
  const withFact = `<ola-engines>${CLAUDE_FACT}, true now): Fallback to Claude is on in this project: tell them to type /claude followed by the request, and do not do it yourself.</ola-engines>\n\nhave claude code do this one: write a file called hello.txt that says hi`
  assert.deepEqual(rulesFor(withFact).map((x) => x.id), [])
  const fd = readFileSync(path.resolve(HERE, '../../../frontdesk/claude.mjs'), 'utf8')
  assert.ok(fd.includes(`return \`${CLAUDE_FACT}, true now): \${fact}\``), 'the web server still writes the fact this way')
})

test('the copies stay equal: the Claude pattern to the web server\'s, the schedule sentence to abilities.json', async () => {
  const { NAMES_CLAUDE, SCHEDULE_SENTENCE } = await import('./index.js')
  const fd = await import(path.resolve(HERE, '../../../frontdesk/claude.mjs'))
  assert.equal(NAMES_CLAUDE.source, fd.NAMES_CLAUDE.source)
  assert.equal(NAMES_CLAUDE.flags, fd.NAMES_CLAUDE.flags)
  const ab = JSON.parse(readFileSync(path.resolve(HERE, '../../../evals/asks/abilities.json'), 'utf8')).abilities.find((a) => a.id === 'schedule')
  assert.equal(ab.cloud.notOffered, SCHEDULE_SENTENCE)
  assert.equal(ab.local.notOffered, SCHEDULE_SENTENCE)
})

test('onContext adds a request\'s rule once, beside a skill, and not for another request', async () => {
  const { RULE_HEAD } = await import('./index.js')
  const ev = (text) => ({ system: [{ type: 'text', text: 'base' }], messages: [{ role: 'user', content: [{ type: 'text', text }] }], sessionID: 's' })
  const a = ev('have claude code do this one: write a file called hello.txt that says hi')
  onContext(a, env)
  onContext(a, env)
  assert.equal(a.system.length, 2)
  assert.ok(a.system[1].text.startsWith(`${RULE_HEAD} claude]`) && a.system[1].text.includes('/claude'))
  const b = ev('can you give me a link to this page that I can send to my group')
  onContext(b, env)
  assert.equal(b.system.length, 3)
  assert.ok(b.system[1].text.includes('<skill_content name="publish">'), 'a link to send is a request to publish')
  assert.ok(b.system[2].text.startsWith(`${RULE_HEAD} link]`), 'and the link rule beside it')
  const c = ev('every monday morning, check the city council agenda and tell me what is new')
  onContext(c, env)
  assert.ok(c.system[1].text.includes('"Ola can\'t do things on a schedule or later by itself: it works when you ask. Ask me again then and I will do it."'))
  const d = ev('publish it')
  onContext(d, { ...env, OLA_SKILLCUE: 'off' })
  assert.equal(d.system.length, 1)
})

// 2.1.0 (OLA-421, check #1): "whats the link for the garden club page? i want to text it to everyone", after the page
// was taken down with the Unpublish button, loaded nothing and got the 404 address as "already live".
const LINKS = [
  'whats the link for the garden club page? i want to text it to everyone',
  'where can people find our garden club page online? i want to email the address to the members',
  'is the garden club page still up? send me the url so i can post it in the group chat',
  "what's the url for our flyer",
  'where is the web address for the sign-up form',
  'the link to the bake sale page please',
  'text everyone the link',
  'can I share the link with the board?',
  'is our site live?',
  'is it online yet',
  'whats the address of the garden club page',
]
const NOT_LINKS = [
  'fix the link to the survey on the page',
  'add a link to the city website at the bottom',
  'change the page so the link goes to the sign-up form',
  'make a flyer with our address and phone number',
  'put our address on the sign-up page',
  'is the page up to date with the new times?',
  'is it working now?',
]

test('2.1.0: a request for the link, the address or whether the page is up loads the publish skill and gets the link rule, in any of these words', async () => {
  const { rulesFor, asksForLink } = await import('./index.js')
  for (const r of LINKS) {
    assert.ok(asksForLink(r), r)
    assert.deepEqual(ids(r), ['publish'], r)
    assert.deepEqual(rulesFor(r).map((x) => x.id), ['link'], r)
  }
  for (const r of NOT_LINKS) {
    assert.deepEqual(rulesFor(r).map((x) => x.id), [], r)
    assert.deepEqual(ids(r), [], r)
  }
  for (const id of ['link-after-unpublish', 'address-after-unpublish', 'url-after-unpublish', 'share-link']) assert.ok(asksForLink(cases.find((c) => c.id === id).say), id)
})

test('2.1.0: the link rule says the address cannot be looked at, names what is not a look, and makes the link a publish with the card', async () => {
  const { RULES } = await import('./index.js')
  const t = RULES.find((x) => x.id === 'link').text
  for (const w of ['cannot look at the web', '.ola/publish/result.json', 'ola-publish status', 'Unpublish button', 'request to publish', 'ola-publish <folder> --files <list>', 'gets the card', 'Never call an address live', 'cannot tell whether the address works'])
    assert.ok(t.includes(w), w)
})

test('2.1.0: an address of Ola\'s sites in what a read, a search or the shell returned gets the note once per conversation; not ola-publish, not Ola\'s own files', async () => {
  const { onToolAfter, ADDRESS_HEAD, reset } = await import('./index.js')
  reset()
  const ev = (tool, input, text, sessionID = 's1') => ({ tool, input, sessionID, status: 'completed', result: { content: [{ type: 'text', text }] } })
  const noted = (e) => e.result.content.map((p) => p.text).join('').includes(ADDRESS_HEAD)
  // What the checker's Ola read: a search of the project for the address (L5), and the old record.
  const g = ev('grep', { pattern: 'ola-publish|publish|sites\\.ola\\.cx' }, '/work/.ola/publish/result.json: {"state": "done", "url": "https://sites.ola.cx/chk421a-test/", "live": true}\n/work/index.html:  <meta property="og:url" content="https://sites.ola.cx/chk421a-test/">')
  onToolAfter(g, {})
  assert.ok(noted(g))
  const note = g.result.content.at(-1).text
  assert.match(note, /names https:\/\/sites\.ola\.cx\/chk421a-test\/\. That is text in a file or a record, not a look at the address/)
  assert.match(note, /Never tell the person it is live, published or working/)
  assert.match(note, /publish the page now/)
  assert.equal(g.result.content[0].text.includes('og:url'), true, 'the output itself is kept')
  // once per conversation for the same address; again in another conversation
  const r = ev('read', { filePath: '/work/index.html' }, 'share: "https://sites.ola.cx/chk421a-test/"')
  onToolAfter(r, {})
  assert.ok(!noted(r))
  const other = ev('read', { filePath: '/work/index.html' }, 'see sites.ola.cx/chk421a-test', 's2')
  onToolAfter(other, {})
  assert.ok(noted(other))
  // ola-publish's own runs (its publish says what the address showed, checked by Ola's server) and the publish skill's scripts
  for (const cmd of ['ola-publish site --files index.html', 'ola-publish status', 'python3 /opt/ola/skills/publish/scripts/publish.py where']) {
    const b = ev('bash', { command: cmd }, 'Published: https://sites.ola.cx/x1/ (1 file(s)).', 's3')
    onToolAfter(b, {})
    assert.ok(!noted(b), cmd)
  }
  // Ola's own files, a writing tool, a failed step, nothing to note, OLA_SKILLCUE=off
  const own = ev('read', { filePath: '/opt/ola/skills/publish/SKILL.md' }, 'at https://sites.ola.cx/example/', 's4')
  onToolAfter(own, {})
  assert.ok(!noted(own))
  const w = ev('write', { filePath: '/work/a.html' }, 'https://sites.ola.cx/x2/', 's4')
  onToolAfter(w, {})
  assert.ok(!noted(w))
  const failed = { ...ev('read', { filePath: '/work/a.html' }, 'https://sites.ola.cx/x3/', 's4'), status: 'error' }
  onToolAfter(failed, {})
  assert.ok(!noted(failed))
  const plain = ev('read', { filePath: '/work/a.html' }, 'no address here; sites.ola.cx on its own is the host', 's4')
  onToolAfter(plain, {})
  assert.ok(!noted(plain))
  const off = ev('read', { filePath: '/work/a.html' }, 'https://sites.ola.cx/x4/', 's5')
  onToolAfter(off, { OLA_SKILLCUE: 'off' })
  assert.ok(!noted(off))
  // a result that came as a string output
  const out = { tool: 'bash', input: { command: 'cat /work/.ola/publish/result.json' }, sessionID: 's6', status: 'completed', result: { output: '{"url": "https://sites.ola.cx/x5/"}' } }
  onToolAfter(out, {})
  assert.ok(noted(out))
  assert.ok(out.result.content[0].text.includes('x5'), 'the output is kept as the first part')
})
