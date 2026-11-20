// A stand-in for Vercel's deploy API and for the published site, for the checks (OLA-209): no
// account, no network. It takes what frontdesk/sites.mjs sends the way Vercel does (files by their
// sha1 first, then a deployment that names them; a file it does not have is `missing_files`), and
// serves the production deployment at its own origin with the headers its vercel.json names, so a
// check can open a published page in a browser exactly as a visitor would.
//
//   const v = await startFakeVercel({ token })   // v.api, v.origin, v.calls, v.live(), v.close()
import { createHash } from 'node:crypto'
import http from 'node:http'

const TYPES = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8', pdf: 'application/pdf' }

export async function startFakeVercel({ token }) {
  const blobs = new Map() // sha1 -> Buffer
  const deployments = new Map() // id -> { files: Map(path -> sha), readyState }
  let production = null
  let n = 0
  const calls = []
  const read = (req) => new Promise((resolve, reject) => {
    const parts = []
    req.on('data', (c) => parts.push(c)).on('end', () => resolve(Buffer.concat(parts))).on('error', reject)
  })
  const send = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))

  const api = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x')
    const authed = req.headers.authorization === `Bearer ${token}`
    calls.push({ method: req.method, path: u.pathname, authed })
    if (!authed) return send(res, 403, { error: { code: 'forbidden', message: 'Not authorized' } })
    const body = await read(req)
    if (req.method === 'POST' && u.pathname === '/v2/files') {
      const sha = createHash('sha1').update(body).digest('hex')
      if (sha !== req.headers['x-vercel-digest']) return send(res, 400, { error: { code: 'incorrect_file_sha' } })
      blobs.set(sha, body)
      return send(res, 200, {})
    }
    if (req.method === 'POST' && u.pathname === '/v13/deployments') {
      const d = JSON.parse(body.toString('utf8'))
      const missing = d.files.filter((f) => !blobs.has(f.sha)).map((f) => f.sha)
      if (missing.length) return send(res, 400, { error: { code: 'missing_files', message: 'Missing files', missing } })
      const id = `dpl_fake${++n}`
      deployments.set(id, { files: new Map(d.files.map((f) => [f.file, f.sha])), readyState: 'BUILDING', target: d.target, project: d.project })
      return send(res, 200, { id, url: `ola-sites-${n}.vercel.app`, readyState: 'BUILDING' })
    }
    const m = /^\/v13\/deployments\/([^/]+)$/.exec(u.pathname)
    if (m && deployments.has(m[1])) {
      const d = deployments.get(m[1])
      if (req.method === 'GET') {
        if (d.readyState !== 'READY') (d.readyState = 'READY'), d.target === 'production' && (production = m[1])
        return send(res, 200, { id: m[1], readyState: d.readyState })
      }
      if (req.method === 'DELETE') {
        if (production === m[1]) return send(res, 400, { error: { code: 'is_production' } })
        deployments.delete(m[1])
        return send(res, 200, { uid: m[1], state: 'DELETED' })
      }
    }
    if (m) return send(res, 404, { error: { code: 'not_found' } })
    return send(res, 404, { error: { code: 'not_found' } })
  })

  // The published site: the production deployment, as Vercel serves a static one.
  const site = http.createServer((req, res) => {
    const d = production && deployments.get(production)
    const u = new URL(req.url, 'http://x')
    let p = ''
    try {
      p = decodeURIComponent(u.pathname).replace(/^\/+/, '')
    } catch {}
    const files = d?.files ?? new Map()
    let headers = []
    try {
      const cfg = JSON.parse(blobs.get(files.get('vercel.json'))?.toString('utf8') ?? '{}')
      headers = (cfg.headers ?? []).flatMap((h) => h.headers ?? [])
    } catch {}
    const isDir = (x) => [...files.keys()].some((f) => f.startsWith(`${x}/`))
    // trailingSlash: true
    if (p && !p.endsWith('/') && !files.has(p) && isDir(p)) return res.writeHead(308, { location: `/${p}/` }).end()
    let file = p === '' || p.endsWith('/') ? `${p}index.html` : p
    let status = 200
    if (!files.has(file)) (file = '404.html'), (status = 404)
    const buf = blobs.get(files.get(file))
    if (!buf) return res.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
    const out = { 'content-type': TYPES[file.split('.').pop().toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' }
    for (const h of headers) out[h.key.toLowerCase()] = h.value
    res.writeHead(status, out).end(req.method === 'HEAD' ? undefined : buf)
  })

  const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.address().port}`)))
  const apiUrl = await listen(api)
  const origin = await listen(site)
  return {
    api: apiUrl,
    origin,
    calls,
    /** The production deployment's files (path -> sha1), or null. */
    live: () => (production ? deployments.get(production)?.files ?? null : null),
    deployments: () => [...deployments.keys()],
    close: () => (api.close(), site.close()),
  }
}
