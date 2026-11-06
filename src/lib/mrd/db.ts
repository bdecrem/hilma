// Server-only access to the mrd Supabase project (apps/mrd) for the law library at ola.cx/mrd.
// The service key never leaves the server; pages call these from server components and route handlers.

function env() {
  const url = process.env.MRD_SUPABASE_URL
  const key = process.env.MRD_SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('MRD_SUPABASE_URL / MRD_SUPABASE_SERVICE_KEY not set')
  return { url, key }
}

function headers(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` }
}

/** Call a stable SQL function over GET. `revalidate` caches it in the Next data cache (the data changes only when a crawl runs). */
export async function rpc<T>(fn: string, args: Record<string, string | number | null | undefined> = {}, revalidate: number | false = 3600): Promise<T> {
  const { url, key } = env()
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(args)) if (v !== null && v !== undefined && v !== '') qs.set(k, String(v))
  const r = await fetch(`${url}/rest/v1/rpc/${fn}?${qs}`, {
    headers: headers(key),
    ...(revalidate === false ? { cache: 'no-store' as const } : { next: { revalidate, tags: ['mrd'] } }),
  })
  if (!r.ok) throw new Error(`mrd ${fn} ${r.status}: ${(await r.text()).slice(0, 300)}`)
  return r.json() as Promise<T>
}

/** The stored full text of a law, or null. Too big for the data cache, so the text module keeps its own. */
export async function fetchLawText(id: string): Promise<string | null> {
  const { url, key } = env()
  const r = await fetch(`${url}/rest/v1/laws?id=eq.${encodeURIComponent(id)}&select=text`, { headers: headers(key), cache: 'no-store' })
  if (!r.ok) throw new Error(`mrd text ${r.status}`)
  const rows = (await r.json()) as { text: string | null }[]
  return rows[0]?.text ?? null
}

/** A short-lived link to the original file the crawl stored (bucket `sources` is private). */
export async function signedFileUrl(path: string, download?: string): Promise<string> {
  const { url, key } = env()
  const r = await fetch(`${url}/storage/v1/object/sign/sources/${path}`, {
    method: 'POST',
    headers: { ...headers(key), 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 600 }),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`mrd sign ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const { signedURL } = (await r.json()) as { signedURL: string }
  return `${url}/storage/v1${signedURL}${download ? `&download=${encodeURIComponent(download)}` : ''}`
}

export async function storagePath(id: string): Promise<{ path: string | null; format: string | null; name: string } | null> {
  const { url, key } = env()
  const r = await fetch(`${url}/rest/v1/laws?id=eq.${encodeURIComponent(id)}&select=storage_path,source_format,name_en,name_cited`, { headers: headers(key), cache: 'no-store' })
  if (!r.ok) return null
  const row = ((await r.json()) as { storage_path: string | null; source_format: string | null; name_en: string | null; name_cited: string }[])[0]
  return row ? { path: row.storage_path, format: row.source_format, name: row.name_en || row.name_cited } : null
}

export type ChunkRow = { chunk: number; src_hash: string; text: string }

export async function pageTranslations(id: string, page: number): Promise<ChunkRow[]> {
  const { url, key } = env()
  const r = await fetch(`${url}/rest/v1/translations?law_id=eq.${encodeURIComponent(id)}&page=eq.${page}&select=chunk,src_hash,text`, { headers: headers(key), cache: 'no-store' })
  if (!r.ok) throw new Error(`mrd translations ${r.status}`)
  return r.json()
}

export async function saveTranslation(row: { law_id: string; page: number; chunk: number; src_hash: string; text: string; model: string }) {
  const { url, key } = env()
  const r = await fetch(`${url}/rest/v1/translations?on_conflict=law_id,page,chunk`, {
    method: 'POST',
    headers: { ...headers(key), 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`mrd save translation ${r.status}: ${(await r.text()).slice(0, 200)}`)
}

export type ArticleEnglish = { article: string; english: string }

export async function articleTranslations(id: string): Promise<ArticleEnglish[]> {
  const { url, key } = env()
  const r = await fetch(`${url}/rest/v1/article_translations?law_id=eq.${encodeURIComponent(id)}&select=article,english`, { headers: headers(key), next: { revalidate: 3600, tags: ['mrd'] } })
  if (!r.ok) return []
  return r.json()
}
