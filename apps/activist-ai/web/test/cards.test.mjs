// Ola's cards, described once (OLA-325): each fixture's description has exactly the lines the
// fixture names, and words typed in the box answer every question card. The same fixtures are
// rendered by the web check (the cards page) and by OlaKit's CardsTests (the apps' copy of this
// module in JavaScriptCore). Run: node --test test/cards.test.mjs (web/check.mjs runs it too).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { answerFromWords, cardLines, localPublishOf, publishCard, publishWithPlan, questionCard } from '../server/cards.mjs'

const { cards } = JSON.parse(fs.readFileSync(new URL('./cards.fixtures.json', import.meta.url), 'utf8'))

const describe = (c) => (c.form ? questionCard(c.form) : c.plan ? publishWithPlan(publishCard(c.permission.action, c.permission.resources, c.ctx ?? {}), c.plan) : publishCard(c.permission.action, c.permission.resources, c.ctx ?? {}))

for (const c of cards) {
  test(`${c.name}: the card's lines`, () => {
    assert.deepEqual(cardLines(describe(c)), c.lines)
  })
  if (c.form) {
    test(`${c.name}: words typed in the box answer the whole card`, () => {
      const card = describe(c)
      assert.equal(card.tapAnswers, c.tapAnswers)
      assert.deepEqual(answerFromWords(card, `  ${c.words} `), c.answer)
      assert.equal(answerFromWords(card, '   '), null)
    })
  }
  if (c.folder) test(`${c.name}: the folder`, () => assert.equal(describe(c).folder, c.folder))
}

test('no card line is a command or a marker', () => {
  for (const c of cards) for (const l of cardLines(describe(c))) assert.ok(!/ola-publish|--files|--fingerprint|\[\[ola/.test(l), `${c.name}: ${l}`)
})

test('the publish yes is never for the rest of the conversation', () => {
  for (const c of cards.filter((x) => x.permission)) {
    const card = describe(c)
    if (card) assert.equal(card.always, false)
  }
})

test('the yes after the check carries the fingerprint of the list it shows', () => {
  for (const c of cards.filter((x) => x.plan)) assert.equal(describe(c).fingerprint, c.plan.fingerprint)
})

test("the Mac's command: odd forms are not read as a publish", () => {
  assert.equal(localPublishOf('ola-publish publish site --name x --fingerprint y | tee log'), null)
  assert.equal(localPublishOf('ola-publish publish site --fingerprint y'), null)
  assert.equal(localPublishOf('ola-publish preview site --name x'), null)
  assert.equal(localPublishOf('ola-publish unpublish site --name x'), null)
  assert.deepEqual(localPublishOf('/Applications/Ola.app/Contents/Helpers/ola-publish publish ./site/ --name x --fingerprint y'), { publish: { folder: './site', name: 'x' } })
})
