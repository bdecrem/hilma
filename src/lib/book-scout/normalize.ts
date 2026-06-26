// Normalize a book title down to its core for fuzzy matching against the
// user's library (dedup). Must stay in lockstep with the loader in
// scripts/book-scout/load-library.py — both produce the same norm_title.
//
// Rules: take the part before the first subtitle separator (: – —), lowercase,
// drop parentheticals, strip to alphanumerics, drop standalone articles.
export function normTitle(raw: string): string {
  let t = raw
  const cut = t.search(/[:–—]/)
  if (cut > 0) t = t.slice(0, cut)
  return t
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
