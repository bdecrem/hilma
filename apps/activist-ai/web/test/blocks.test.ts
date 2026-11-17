// Ola's reply as blocks (src/lib/blocks.ts): the Markdown subset the page draws.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blocks } from '../src/lib/blocks.ts'

test('a Markdown table in a reply is a table, not a paragraph of pipes (first-user pass)', () => {
  const b = blocks('Totals:\n\n| Site | Households |\n|------|-----------:|\n| North | 11 |\n| South | 9 |\n\nTwo rows had no count.')
  assert.deepEqual(b.map((x) => x.kind), ['p', 'table', 'p'])
  assert.deepEqual(b[1], { kind: 'table', head: ['Site', 'Households'], rows: [['North', '11'], ['South', '9']] })
})

test('pipes without a rule under them stay text; lists and headings as before', () => {
  assert.deepEqual(blocks('a | b\n| c |').map((x) => x.kind), ['p'])
  assert.deepEqual(blocks('# Title\n- one\n- two\n1. first').map((x) => x.kind), ['h', 'ul', 'ol'])
})
