import { bookScoutDb } from './db'
import { normTitle } from './normalize'
import type { Book } from './email'

export type LibraryBook = { title: string; author: string; type: string; acquired: string }

// Normalized titles of everything the user owns or has sampled — for dedup.
export async function getOwnedTitles(): Promise<Set<string>> {
  const { data } = await bookScoutDb().from('book_scout_library').select('norm_title')
  return new Set((data ?? []).map((r) => r.norm_title as string))
}

// The user's FICTION library, for building a taste profile (Claude Code Picks).
export async function getFictionLibrary(): Promise<LibraryBook[]> {
  const { data } = await bookScoutDb()
    .from('book_scout_library')
    .select('title, author, type, acquired')
    .eq('is_fiction', true)
  return (data ?? []) as LibraryBook[]
}

// A specific user's library (their uploaded books).
export async function getUserLibrary(userId: string): Promise<LibraryBook[]> {
  const { data } = await bookScoutDb()
    .from('book_scout_library')
    .select('title, author, type, acquired')
    .eq('user_id', userId)
  return (data ?? []).map((b) => ({ title: b.title, author: b.author ?? '', type: b.type ?? '', acquired: b.acquired ?? '' }))
}

// Normalized titles a specific user owns — for per-user dedup.
export async function getUserOwnedTitles(userId: string): Promise<Set<string>> {
  const { data } = await bookScoutDb().from('book_scout_library').select('norm_title').eq('user_id', userId)
  return new Set((data ?? []).map((r) => r.norm_title as string))
}

// Drop any recommended book the user already owns/sampled (by normalized title).
export function filterOwned<T extends { title: string }>(books: T[], owned: Set<string>): T[] {
  return books.filter((b) => !owned.has(normTitle(b.title)))
}

export type { Book }
