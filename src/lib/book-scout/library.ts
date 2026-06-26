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

// Drop any recommended book the user already owns/sampled (by normalized title).
export function filterOwned<T extends { title: string }>(books: T[], owned: Set<string>): T[] {
  return books.filter((b) => !owned.has(normTitle(b.title)))
}

export type { Book }
