// Replays one Infinity chat's transcript through the clean-up curation N times
// and reports the raw shape of each tool call. Usage:
//   npx tsx scripts/polly/cleanup-repro.ts <chat id> [n]

import { analyzeConversation, chatRows, getInfinityChat } from '@/lib/polly/infinity'
import { pollySupabase } from '@/lib/polly/supabase'

const [chatId, nArg] = process.argv.slice(2)
const n = Number(nArg ?? 6)

async function main() {
  const { data } = await pollySupabase().from('polly_infinity_chats').select('user_id').eq('id', chatId).single()
  const userId = (data as { user_id: string }).user_id
  const chat = await getInfinityChat(userId, chatId)
  if (!chat) throw new Error('chat not found')
  const rows = await chatRows(userId, chat)
  console.log(`${rows.length} turns`)
  const runs = await Promise.all(Array.from({ length: n }, async (_, i) => {
    try {
      const a = await analyzeConversation({ language: 'it', transcript: rows, fallbackTitle: chat.title, quality: 'fast' })
      return `run ${i + 1}: ok — ${a.fixes.length} fixes, ${a.vocab.length} vocab, ${a.grammar.length} grammar`
    } catch (e) {
      return `run ${i + 1}: FAILED — ${(e as Error).message}`
    }
  }))
  runs.forEach((r) => console.log(r))
}

main().catch((e) => { console.error(e); process.exit(1) })
