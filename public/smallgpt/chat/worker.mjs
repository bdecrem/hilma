// The chat page's worker: loads the tokenizer and a model's weights, then
// writes answers token by token so the page never freezes.
//
// in:  { id, model: 'cranky' | 'cranky-10m' | 'helpful' | 'base' | 'base-10m', text, temperature, topK }, or { preload: model }
// out: { loading, got, total } while a model downloads, { loaded } after,
//      { id, text } as it writes, { id, text, done, ms, tokens }

import { makeModel, makeTokenizer } from './gpt.mjs'

const USER = 8192, ASSISTANT = 8193 // the two tokens step 9 added
let tok = null
const models = {} // name -> promise of the model, so a question that arrives mid-download waits for the same download

const get = (f, as) => fetch(f).then((r) => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r[as]() })

// The 92M models' weights come in parts of meta.part bytes (export_web.py); read them
// into one buffer at their offsets, reporting progress.
async function parts(name, meta) {
  const buf = new Uint8Array(meta.bytes)
  let got = 0, last = 0
  await Promise.all(meta.bin.map(async (u, i) => {
    const r = await fetch(u)
    if (!r.ok) throw new Error(`${u}: ${r.status}`)
    const reader = r.body.getReader()
    for (let at = i * meta.part; ;) {
      const { done, value } = await reader.read()
      if (done) break
      buf.set(value, at)
      at += value.length
      got += value.length
      if (got - last > 1e6) { last = got; postMessage({ loading: name, got, total: meta.bytes }) }
    }
  }))
  if (got !== meta.bytes) throw new Error(`${name}: got ${got} of ${meta.bytes} bytes`)
  return buf.buffer
}

function load(name) {
  if (!models[name]) {
    models[name] = (async () => {
      postMessage({ loading: name })
      try {
        const [tj, meta] = await Promise.all([tok ? null : get('tok.json', 'json'), get(`${name}.json`, 'json')])
        postMessage({ loading: name, got: 0, total: meta.bytes })
        const buf = meta.bin ? await parts(name, meta) : await get(`${name}.bin`, 'arrayBuffer')
        if (!tok) tok = makeTokenizer(tj)
        return makeModel(meta, buf)
      } catch (e) {
        delete models[name] // so the next question tries again
        throw e
      } finally {
        postMessage({ loaded: name })
      }
    })()
  }
  return models[name]
}

onmessage = async ({ data: m }) => {
  if (m.preload) return load(m.preload).catch(() => {}) // a question will retry and show the error
  try {
    const model = await load(m.model)
    // The base models never saw a conversation: they get the question as the start of a post.
    const base = m.model.startsWith('base')
    const prompt = base ? tok.encode(m.text + '\n') : [USER, ...tok.encode(m.text), ASSISTANT]
    const dec = new TextDecoder()
    const out = []
    const t0 = performance.now()
    let last = t0
    for (const id of model.generate(prompt, { n: base ? 80 : 120, temperature: m.temperature, topK: m.topK, stop: tok.eot })) {
      out.push(id)
      const now = performance.now()
      if (now - last > 40) {
        postMessage({ id: m.id, text: dec.decode(tok.bytes(out)) })
        last = now
      }
    }
    postMessage({ id: m.id, text: dec.decode(tok.bytes(out)).trim(), done: true, ms: performance.now() - t0, tokens: out.length })
  } catch (e) {
    postMessage({ id: m.id, error: String(e) })
  }
}
