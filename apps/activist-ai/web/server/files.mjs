// The workspace's files, as the front desk serves them to the page: list, upload, download, delete.
//
// In the dev server the workspace is a temp folder on this Mac. On the Studio the same four calls
// go to `workspace/ws.mjs` (upload through ola-put, list through ola-files) on the person's VM
// volume; the HTTP shape below is the seam and stays the same.
//
// Rules, the same as ola-put's: a plain file name (letters, digits, space . _ ( ) + , -), at most
// 200 characters, not starting with a dot, no folders. Uploads never replace a file unless asked.
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

export const NAME = /^[A-Za-z0-9][A-Za-z0-9 ._()+,-]{0,199}$/
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
/** What a person sees when a file is over the limit (the page says the same before sending; see src/lib/api.ts). */
export const tooLargeMessage = (max) => `That file is larger than ${Math.round((max / 1024 / 1024) * 10) / 10} MB, the most Ola accepts.`
// What opencode and git keep in the folder; never listed, never served.
const HIDDEN = (rel) => rel.split('/').some((part) => part.startsWith('.') || part === 'node_modules' || part === '__pycache__')

export function validName(name) {
  return typeof name === 'string' && NAME.test(name) && !name.includes('..')
}

/** A relative path inside the workspace, each part a valid name; null when it is not one. */
export function safeRelative(rel) {
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > 600) return null
  const parts = rel.split('/')
  if (parts.length > 6 || !parts.every(validName)) return null
  return parts.join('/')
}

/**
 * The manifest says which files the person uploaded (the rest Ola made). It lives outside the
 * workspace, so the agent cannot rewrite it.
 */
export function makeFiles({ work, manifestPath }) {
  async function readManifest() {
    try {
      return JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    } catch {
      return {}
    }
  }
  async function writeManifest(m) {
    await fs.writeFile(manifestPath, JSON.stringify(m, null, 2), { mode: 0o600 })
  }

  async function list() {
    const manifest = await readManifest()
    const out = []
    async function walk(dir, depth) {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const e of entries) {
        const abs = path.join(dir, e.name)
        const rel = path.relative(work, abs).split(path.sep).join('/')
        if (HIDDEN(rel)) continue
        if (e.isDirectory() && depth < 5) await walk(abs, depth + 1)
        else if (e.isFile()) {
          const st = await fs.stat(abs)
          out.push({
            path: rel,
            size: st.size,
            modified: st.mtime.toISOString(),
            origin: manifest[rel] ? 'uploaded' : 'made',
            uploaded: manifest[rel]?.at ?? null,
          })
        }
      }
    }
    await walk(work, 0)
    out.sort((a, b) => (a.origin === b.origin ? a.path.localeCompare(b.path) : a.origin === 'uploaded' ? -1 : 1))
    return out
  }

  /** Streams the request body into the workspace through a temp file and a rename. */
  async function upload(name, req, { replace = false } = {}) {
    if (!validName(name)) return { status: 400, body: { error: 'bad_name', message: 'The file name has characters Ola does not accept. Rename it with letters, digits and spaces.' } }
    const declared = Number(req.headers['content-length'] ?? NaN)
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) return { status: 413, body: { error: 'too_large', message: tooLargeMessage(MAX_UPLOAD_BYTES) } }
    const dest = path.join(work, name)
    const exists = await fs.lstat(dest).then(() => true, () => false)
    if (exists && !replace) return { status: 409, body: { error: 'exists', message: `There is already a file called ${name}.` } }
    const tmp = path.join(work, `.upload-${process.pid}-${Date.now()}`)
    const hash = createHash('sha256')
    let size = 0
    try {
      await pipeline(
        req,
        async function* (source) {
          for await (const chunk of source) {
            size += chunk.length
            if (size > MAX_UPLOAD_BYTES) throw Object.assign(new Error('too large'), { code: 'TOO_LARGE' })
            hash.update(chunk)
            yield chunk
          }
        },
        createWriteStream(tmp, { mode: 0o644 }),
      )
      await fs.rename(tmp, dest)
    } catch (e) {
      await fs.rm(tmp, { force: true })
      if (e?.code === 'TOO_LARGE') return { status: 413, body: { error: 'too_large', message: tooLargeMessage(MAX_UPLOAD_BYTES) } }
      return { status: 500, body: { error: 'write_failed', message: 'The file could not be written on Ola’s computer.' } }
    }
    const manifest = await readManifest()
    manifest[name] = { at: new Date().toISOString(), size, sha256: hash.digest('hex') }
    await writeManifest(manifest)
    return { status: 201, body: { path: name, size, sha256: manifest[name].sha256 } }
  }

  async function open(rel) {
    const safe = safeRelative(rel)
    if (!safe) return null
    const abs = path.join(work, safe)
    const st = await fs.lstat(abs).catch(() => null)
    if (!st || !st.isFile()) return null
    return { abs, size: st.size, stream: () => createReadStream(abs) }
  }

  async function remove(rel) {
    const safe = safeRelative(rel)
    if (!safe) return false
    const abs = path.join(work, safe)
    const st = await fs.lstat(abs).catch(() => null)
    if (!st || !st.isFile()) return false
    await fs.rm(abs)
    const manifest = await readManifest()
    if (manifest[safe]) {
      delete manifest[safe]
      await writeManifest(manifest)
    }
    return true
  }

  async function readText(rel, maxBytes = 64 * 1024) {
    const f = await open(rel)
    if (!f) return null
    const fh = await fs.open(f.abs)
    try {
      const buf = Buffer.alloc(Math.min(maxBytes, f.size))
      await fh.read(buf, 0, buf.length, 0)
      return buf.toString('utf8')
    } finally {
      await fh.close()
    }
  }

  return { list, upload, open, remove, readText, markUploaded: async (name, at) => {
    const m = await readManifest()
    m[name] = { at: at ?? new Date().toISOString() }
    await writeManifest(m)
  } }
}
