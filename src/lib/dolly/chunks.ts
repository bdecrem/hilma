// The level chunks in the learner's stash: every word and chunk of the
// can-dos of the levels they are on or have climbed, grouped by level. They
// are the curriculum's (never deleted); a learner can hide one, which keeps
// it out of flash sets too. A chunk's id is "<cando id>:<target>".
import { listEarned, type User } from './core'
import { canDos, levelInfo } from './curriculum'
import { type LanguageCode } from './language'

/** The highest level whose chunks are the learner's: the levels climbed,
 *  plus the current one once it is started (an objective earned there).
 *  Level 1 counts from day one. */
export async function activeTopLevel(user: Pick<User, 'id' | 'rung'>): Promise<number> {
  if (user.rung <= 1) return 1
  const earned = await listEarned(user.id)
  return earned.some((e) => e.level === user.rung) ? user.rung : user.rung - 1
}

export type ChunkView = { id: string; cando: string; title: string; target: string; native: string; pinyin: string | null; hidden: boolean }
export type LevelChunks = { level: number; name: string; items: ChunkView[] }

export function chunkId(candoId: string, target: string): string {
  return `${candoId}:${target}`
}

export function levelChunks(lang: LanguageCode, rung: number, hidden: string[]): LevelChunks[] {
  const hid = new Set(hidden)
  const out: LevelChunks[] = []
  for (let level = 1; level <= rung; level++) {
    const items = canDos(lang, level).flatMap((c) =>
      c.items.map((it) => ({ id: chunkId(c.id, it.t), cando: c.id, title: c.title, target: it.t, native: it.n, pinyin: lang === 'zh' ? it.p ?? null : null, hidden: hid.has(chunkId(c.id, it.t)) })),
    )
    if (items.length > 0) out.push({ level, name: levelInfo(level).name, items })
  }
  return out
}

/** Is this a chunk id the learner could hide (one of their levels')? */
export function knownChunk(lang: LanguageCode, rung: number, id: string): boolean {
  return levelChunks(lang, rung, []).some((l) => l.items.some((i) => i.id === id))
}
