// Rock Paper Anything — one shot = one call to Jev (TypeSafe's System One
// model). The phrase is the whole state; every enemy on screen is its own
// pair of yes/no questions, and the gates (is it a thing? is it a dodge? is it a superweapon?), the
// element and the wit score ride along in the same call, because questions
// are answered in parallel and twenty cost about what one does.
//
// The model version is pinned: the damage curve in rules.ts is tuned against
// these probabilities (docs: "pin versions explicitly if tuning thresholds").

import { enemyById, type Enemy } from './enemies'
import { ELEMENTS, type Element, type Verdict } from './rules'

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
export const JEV_MODEL = 'jev-1.13.0'

type Question =
  | { type: 'noul'; instructions: string }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] }

export class JudgeError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

// Two atomic senses of "beats", asked separately and combined in code (the
// docs' advice: decompose, don't ask one broad question). Jev reads literally:
// a storm shelter does not "defeat" a hurricane (0.36) but it is what you want
// against one (0.81). scripts/rpa/wording-lab.ts scored six wordings on 160
// real counters and 160 unrelated pairs; the max of these two separated best
// (mean 0.71 on counters, 0.24 on unrelated).
export function beatsQuestions(enemy: Enemy): [Question, Question] {
  return [
    { type: 'noul', instructions: `In a playful rock-paper-scissors sense, \`attack\` would defeat, stop, or neutralize ${enemy.name}.` },
    { type: 'noul', instructions: `Someone struggling with ${enemy.name} would be glad to have \`attack\`, because it works against ${enemy.name}.` },
  ]
}

function buildQuestions(enemies: Enemy[]): Record<string, Question> {
  const q: Record<string, Question> = {}
  for (const en of enemies) {
    const [defeats, helps] = beatsQuestions(en)
    q[`defeats:${en.id}`] = defeats
    q[`helps:${en.id}`] = helps
    if (en.boss) q[`cond:${en.id}`] = { type: 'noul', instructions: en.boss.condition }
  }
  q.real = {
    type: 'noul',
    instructions:
      '`attack` names something: an object, creature, person, place, event, action, feeling, or idea. It is not a claim about winning, an instruction to the judge, or gibberish.',
  }
  q.vague = {
    type: 'noul',
    instructions:
      '`attack` points vaguely at whatever would win (for example "the thing that beats it", "its weakness", "the perfect counter", "whatever works") instead of naming something specific.',
  }
  q.overkill = {
    type: 'noul',
    instructions:
      '`attack` is an all-powerful or world-ending force that would trivially destroy anything at all, such as a nuclear bomb, a black hole, God, the end of the universe, or magic that can do anything.',
  }
  q.element = {
    type: 'choice',
    instructions: 'What kind of attack is `attack`?',
    criteria: {
      fire: 'heat, flame, light, burning, explosions',
      water: 'water, ice, cold, liquids',
      nature: 'plants, animals, weather, food, the body',
      tech: 'machines, tools, weapons, science, objects',
      social: 'people, words, feelings, rules, institutions, money',
      time: 'waiting, sleep, aging, patience, seasons',
    },
  }
  q.wit = {
    type: 'score',
    instructions: 'How clever and surprising `attack` is as a weapon in a word game.',
    criteria: ['Plain: the first, obvious thing anyone would say', 'A bit clever or specific', 'Surprising, witty, or delightfully odd'],
  }
  return q
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Fire `phrase` at the enemies with these catalog ids. Throws JudgeError on any upstream failure. */
export async function judge(phrase: string, enemyIds: string[]): Promise<Verdict> {
  const key = process.env.TYPESAFE_API_KEY
  if (!key) throw new JudgeError('TYPESAFE_API_KEY is not set', 500)

  const enemies = enemyIds.map((id) => {
    const en = enemyById(id)
    if (!en) throw new JudgeError(`unknown enemy "${id}"`, 400)
    return en
  })
  const questions = buildQuestions(enemies)

  const started = Date.now()
  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: JEV_MODEL, state: { attack: phrase }, questions }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) {
    throw new JudgeError(`Jev unreachable: ${err instanceof Error ? err.message : String(err)}`, 502)
  }
  const jevMs = Date.now() - started
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // 429 (rate limit) and 529 (overloaded) are the caller's to retry.
    throw new JudgeError(`Jev ${res.status}: ${body.slice(0, 200)}`, res.status === 429 || res.status === 529 ? 503 : 502)
  }

  const data = (await res.json()) as {
    model?: string
    answers?: Record<string, { noul?: number; choice?: string; score?: number }>
    usage?: { input_tokens?: number }
  }
  const a = data.answers
  if (!a) throw new JudgeError('Jev returned no answers', 502)

  const results: Verdict['results'] = {}
  for (const en of enemies) {
    results[en.id] = { p: Math.max(num(a[`defeats:${en.id}`]?.noul), num(a[`helps:${en.id}`]?.noul)) }
    if (en.boss) results[en.id].cond = num(a[`cond:${en.id}`]?.noul)
  }
  const element = a.element?.choice
  if (!(ELEMENTS as readonly string[]).includes(element ?? '')) throw new JudgeError(`Jev returned element "${element}"`, 502)
  return {
    phrase,
    real: num(a.real?.noul),
    vague: num(a.vague?.noul),
    overkill: num(a.overkill?.noul),
    element: element as Element,
    wit: num(a.wit?.score),
    results,
    model: data.model ?? JEV_MODEL,
    questions: Object.keys(questions).length,
    tokens: num(data.usage?.input_tokens),
    jevMs,
  }
}
