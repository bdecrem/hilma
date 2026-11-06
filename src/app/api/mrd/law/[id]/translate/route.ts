import { getDoc, page } from '@/lib/mrd/text'
import { pageTranslations, rpc, saveTranslation } from '@/lib/mrd/db'
import { MODEL, chunks, sha1, translate } from '@/lib/mrd/translate'

export const maxDuration = 300

// The reader's English switch: one page of a law in English, streamed as NDJSON lines {i, n, text} as chunks finish.
// Chunks already translated come straight from the database; the rest are translated in parallel and saved.
const inflight = new Map<string, Promise<string>>()

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const n = Number(new URL(req.url).searchParams.get('page') ?? 0) || 0
  const doc = await getDoc(id)
  if (!doc) return Response.json({ error: 'no text stored for this law' }, { status: 404 })
  const pg = page(doc, n)
  const parts = chunks(pg.text)
  const [have, law] = await Promise.all([
    pageTranslations(id, pg.page),
    rpc<{ name: string; language: string | null } | null>('lib_law', { p_id: id }).catch(() => null),
  ])
  const byChunk = new Map(have.map(r => [r.chunk, r]))
  const enc = new TextEncoder()

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: object) => ctrl.enqueue(enc.encode(JSON.stringify(o) + '\n'))
      send({ n: parts.length })
      await Promise.all(parts.map(async (src, i) => {
        const h = sha1(src)
        const got = byChunk.get(i)
        if (got && got.src_hash === h) { send({ i, text: got.text }); return }
        const k = `${id}:${pg.page}:${i}:${h}`
        try {
          let p = inflight.get(k)
          if (!p) {
            p = translate(src, { lang: law?.language, law: law?.name }).then(async text => {
              await saveTranslation({ law_id: id, page: pg.page, chunk: i, src_hash: h, text, model: MODEL })
              return text
            }).finally(() => inflight.delete(k))
            inflight.set(k, p)
          }
          send({ i, text: await p })
        } catch (e) {
          send({ i, error: e instanceof Error ? e.message.slice(0, 200) : 'failed' })
        }
      }))
      ctrl.close()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } })
}
