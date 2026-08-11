#!/usr/bin/env node
// One-time backfill for f2_flash_cards.open_question (migration 027).
//
// Scans every existing card and, ONLY where the question depends on seeing
// the multiple-choice options ("Which of these…", "all of the above",
// odd-one-out), writes an equivalent standalone rewording with the same
// canonical answer. Cards that already stand alone are left untouched.
//
// Usage: node scripts/backfill-open-questions.mjs [--dry-run]
//        (keys read from .env.local; re-runnable — only scans cards with
//        open_question still null)

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry-run')
const BATCH = 25
const JUDGE_MODEL = 'claude-haiku-4-5'

function envVar(name) {
  const env = readFileSync(join(ROOT, '.env.local'), 'utf8')
  const m = env.match(new RegExp(`^${name}=(.+)$`, 'm'))
  if (!m) throw new Error(`${name} not found in .env.local`)
  return m[1].trim()
}

const sb = createClient(envVar('SUPABASE_URL'), envVar('SUPABASE_SERVICE_KEY'), {
  auth: { persistSession: false },
})
const anthropicKey = envVar('ANTHROPIC_API_KEY')

const SYSTEM = `You review flash-card questions for a learning app. The deck is played in three modes: multiple-choice (choices visible) and typed/voice (question only, no choices).

For each card, decide whether the question STANDS ALONE without the choices. Flag it only when it genuinely depends on seeing the options: "which of these / which of the following / which option", "all/none of the above", odd-one-out, or comparisons against an unseen list. Ordinary questions — even hard ones — are fine as-is.

For every flagged card, write open_question: an equivalent standalone question that tests the same fact and has the SAME canonical answer, matched in tone and difficulty. For every other card, return null.`

async function judgeBatch(cards) {
  const listing = cards
    .map((c, i) => `${i}. Question: ${c.question}\n   Canonical answer: ${c.answer}`)
    .join('\n\n')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Review these flash cards:\n\n${listing}\n\nReturn a verdict for every index.`,
        },
      ],
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              verdicts: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'integer' },
                    open_question: { type: ['string', 'null'] },
                  },
                  required: ['index', 'open_question'],
                  additionalProperties: false,
                },
              },
            },
            required: ['verdicts'],
            additionalProperties: false,
          },
        },
      },
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const json = await res.json()
  const text = (json.content ?? []).find((b) => b.type === 'text')?.text ?? '{}'
  return JSON.parse(text).verdicts ?? []
}

const { data: cards, error } = await sb
  .from('f2_flash_cards')
  .select('id, question, answer')
  .is('open_question', null)
  .order('created_at')
if (error) throw new Error(error.message)
console.log(`${cards.length} cards to scan${DRY ? ' (dry run)' : ''}`)

let flagged = 0
for (let i = 0; i < cards.length; i += BATCH) {
  const batch = cards.slice(i, i + BATCH)
  const verdicts = await judgeBatch(batch)
  for (const v of verdicts) {
    const card = batch[v.index]
    const open = (v.open_question ?? '').trim()
    if (!card || !open) continue
    flagged++
    console.log(`\n[${card.id}]\n  MC:   ${card.question}\n  open: ${open}`)
    if (!DRY) {
      const { error: upErr } = await sb
        .from('f2_flash_cards')
        .update({ open_question: open, updated_at: new Date().toISOString() })
        .eq('id', card.id)
      if (upErr) console.error(`  UPDATE FAILED: ${upErr.message}`)
    }
  }
  process.stdout.write(`\rscanned ${Math.min(i + BATCH, cards.length)}/${cards.length}`)
}
console.log(`\ndone — ${flagged} card(s) ${DRY ? 'would get' : 'got'} an open_question`)
