// Render cache: the last whole-track render of each track, kept in IndexedDB
// as 16-bit PCM and keyed by a hash of the serialized session plus the engine
// bundle stamp. Reopening a track whose session has not changed plays from the
// cache instantly instead of re-rendering (a long song takes tens of seconds on
// a phone). Any change to the session changes the key, so a stale render can
// never be played for a different state; the engine stamp is in the key so a
// bundle update re-renders too.

import type { RenderResult } from './jambot'

const DB_NAME = 'jam-renders'
const STORE = 'renders'
const KEEP = 6            // most recent tracks kept per device

type Row = {
  trackId: string
  key: string
  bpm: number
  bars: number
  hasArrangement: boolean
  synths: string[]
  message: string
  sampleRate: number
  channels: number
  length: number
  pcm: ArrayBuffer       // planar Int16: channel 0 samples, then channel 1 …
  savedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'trackId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
  })
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = run(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'))
  })
}

/** Cache key for a session: SHA-256 of its serialized JSON plus the engine stamp. */
export async function renderCacheKey(sessionJson: string, stamp: string): Promise<string> {
  const text = `${stamp}|${sessionJson}`
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // Insecure context (plain http on a LAN): FNV-1a is plenty for a change detector.
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
    return `fnv-${h.toString(16)}-${text.length}`
  }
}

function makeBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
  try {
    return new AudioBuffer({ numberOfChannels: channels, length, sampleRate })
  } catch {
    const Ctor = (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext
      || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
    if (!Ctor) throw new Error('no AudioBuffer constructor')
    return new Ctor(channels, length, sampleRate).createBuffer(channels, length, sampleRate)
  }
}

/** The cached render for a track if its key matches, else null. Never throws. */
export async function loadCachedRender(trackId: string, key: string): Promise<RenderResult | null> {
  try {
    const db = await openDb()
    const row = await tx<Row | undefined>(db, 'readonly', (s) => s.get(trackId) as IDBRequest<Row | undefined>)
    db.close()
    if (!row || row.key !== key || !row.pcm || !row.length) return null
    const buffer = makeBuffer(row.channels, row.length, row.sampleRate)
    const all = new Int16Array(row.pcm)
    for (let ch = 0; ch < row.channels; ch++) {
      const f32 = new Float32Array(row.length)
      const base = ch * row.length
      for (let i = 0; i < row.length; i++) f32[i] = all[base + i] / 32768
      buffer.copyToChannel(f32, ch)
    }
    return { buffer, message: row.message, bars: row.bars, bpm: row.bpm, synths: row.synths, hasArrangement: row.hasArrangement }
  } catch (e) {
    console.warn('[jam] render cache read failed', e)
    return null
  }
}

/** Store a whole-track render (planar Int16) and prune to the KEEP most recent tracks. Never throws. */
export async function saveRender(trackId: string, key: string, r: RenderResult): Promise<void> {
  try {
    const { buffer } = r
    const channels = buffer.numberOfChannels
    const length = buffer.length
    const all = new Int16Array(channels * length)
    for (let ch = 0; ch < channels; ch++) {
      const data = buffer.getChannelData(ch)
      const base = ch * length
      for (let i = 0; i < length; i++) {
        const v = Math.max(-1, Math.min(1, data[i]))
        all[base + i] = v < 0 ? v * 32768 : v * 32767
      }
    }
    const row: Row = {
      trackId, key, bpm: r.bpm, bars: r.bars, hasArrangement: r.hasArrangement, synths: r.synths, message: r.message,
      sampleRate: buffer.sampleRate, channels, length, pcm: all.buffer, savedAt: Date.now(),
    }
    const db = await openDb()
    await tx(db, 'readwrite', (s) => s.put(row))
    // Prune: keep the KEEP most recently saved tracks.
    const rows = await tx<Row[]>(db, 'readonly', (s) => s.getAll() as IDBRequest<Row[]>)
    const stale = rows.sort((a, b) => b.savedAt - a.savedAt).slice(KEEP)
    for (const old of stale) await tx(db, 'readwrite', (s) => s.delete(old.trackId))
    db.close()
  } catch (e) {
    console.warn('[jam] render cache write failed', e)
  }
}

/** Drop a track's cached render (e.g. when the track is deleted). Never throws. */
export async function dropCachedRender(trackId: string): Promise<void> {
  try {
    const db = await openDb()
    await tx(db, 'readwrite', (s) => s.delete(trackId))
    db.close()
  } catch { /* nothing to drop */ }
}
