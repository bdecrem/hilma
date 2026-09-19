// Smoke test for the model registry: the default, the retired aliases and
// Fable, each through the forced-tool path the chat uses.
//   set -a; . .env.local; set +a; npx tsx scripts/polly/llm-smoke.ts
import { llmComplete } from '../../src/lib/polly/llm'
const tools = [{ name: 'reply', description: 'Reply to the learner.', input_schema: { type: 'object' as const, properties: { text: { type: 'string' } }, required: ['text'] } }]
async function main() {
  for (const model of [undefined, 'sonnet-4-6', 'opus-4-8', 'fable-5-1'] as const) {
    const t = Date.now()
    try {
      const r = await llmComplete({ model, system: 'You are a terse Italian tutor.', messages: [{ role: 'user', content: 'Say "good morning" in Italian.' }], maxTokens: 300, tools, forceTool: true } as never)
      console.log(String(model), '→', JSON.stringify(r).slice(0, 220), `${Date.now() - t}ms`)
    } catch (e) { console.log(String(model), 'FAILED', (e as Error).message.slice(0, 300)) }
  }
  
}
main()
