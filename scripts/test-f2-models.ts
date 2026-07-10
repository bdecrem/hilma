// Harness for the F2 multi-model chat layer (src/lib/f2/llm.ts).
//
// For each registry model: (1) a forced-tool router request shaped exactly
// like routeAndReply's, expecting a start_new_topic tool call; (2) a plain
// text request. Run: npx tsx scripts/test-f2-models.ts [modelKey ...]
//
// Reads ANTHROPIC_API_KEY / TOGETHER_API_KEY from .env.local.

import { readFileSync } from 'fs'
import { llmComplete, type LlmTool } from '../src/lib/f2/llm'

// Minimal .env.local loader — no dotenv dependency.
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const TOOLS: LlmTool[] = [
  {
    name: 'continue_chat',
    description: "Reply within the user's ACTIVE learning thread.",
    input_schema: {
      type: 'object',
      properties: { reply: { type: 'string' } },
      required: ['reply'],
    },
  },
  {
    name: 'start_new_topic',
    description:
      'Start a fresh learning thread on a DIFFERENT topic. Use when the user explicitly asks to learn something new.',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Short noun phrase (2-5 words).' },
        opening_reply: { type: 'string', description: 'Full response to the user.' },
      },
      required: ['topic', 'opening_reply'],
    },
  },
  {
    name: 'chitchat',
    description: 'Answer an off-topic question. Not persisted.',
    input_schema: {
      type: 'object',
      properties: { reply: { type: 'string' } },
      required: ['reply'],
    },
  },
]

const ROUTER_SYSTEM = `You are F2 — a learning companion. The user has no active learning thread yet.

For every message, pick exactly one tool:
- start_new_topic: if the user wants to learn something.
- chitchat: only for clearly off-topic banter.
- continue_chat: do NOT use — there is no active thread.`

async function testModel(key: string | null): Promise<boolean> {
  const label = key ?? '(default)'
  let ok = true

  // 1. Forced tool call — the router path.
  try {
    const t0 = Date.now()
    const routed = await llmComplete({
      model: key,
      system: ROUTER_SYSTEM,
      messages: [{ role: 'user', content: 'Teach me about the Dutch tulip mania.' }],
      maxTokens: 1000,
      tools: TOOLS,
      forceTool: true,
    })
    const dt = ((Date.now() - t0) / 1000).toFixed(1)
    if (routed.type === 'tool_call' && routed.name === 'start_new_topic') {
      const input = routed.input as { topic?: string; opening_reply?: string }
      console.log(
        `  ✅ ${label} router (${dt}s): start_new_topic topic="${input.topic}" reply=${JSON.stringify((input.opening_reply ?? '').slice(0, 80))}…`,
      )
      if (!input.topic || !input.opening_reply) {
        console.log(`  ❌ ${label} router: missing tool args`)
        ok = false
      }
    } else {
      console.log(`  ❌ ${label} router (${dt}s): expected start_new_topic, got ${JSON.stringify(routed).slice(0, 200)}`)
      ok = false
    }
  } catch (err) {
    console.log(`  ❌ ${label} router threw: ${err}`)
    ok = false
  }

  // 2. Plain text — the reflection path.
  try {
    const t0 = Date.now()
    const text = await llmComplete({
      model: key,
      system: 'Reply in exactly one short sentence. Plain text.',
      messages: [{ role: 'user', content: 'Say hello to a learner named Bart.' }],
      maxTokens: 120,
    })
    const dt = ((Date.now() - t0) / 1000).toFixed(1)
    if (text.type === 'text' && text.text.length > 0) {
      console.log(`  ✅ ${label} text (${dt}s): ${JSON.stringify(text.text.slice(0, 80))}`)
    } else {
      console.log(`  ❌ ${label} text (${dt}s): empty/wrong result ${JSON.stringify(text).slice(0, 200)}`)
      ok = false
    }
  } catch (err) {
    console.log(`  ❌ ${label} text threw: ${err}`)
    ok = false
  }

  return ok
}

async function main() {
  const keys = process.argv.slice(2).length
    ? process.argv.slice(2).map((k) => (k === 'default' ? null : k))
    : [null, 'opus-4-8', 'fable-5', 'glm-5.2']

  let allOk = true
  for (const key of keys) {
    console.log(`\nModel: ${key ?? '(default → sonnet-4-6)'}`)
    if (!(await testModel(key))) allOk = false
  }
  console.log(allOk ? '\nAll models passed.' : '\nFAILURES — see above.')
  process.exit(allOk ? 0 : 1)
}

main()
