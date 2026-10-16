// The chat page's worker: loads the tokenizer and a model's weights, then
// writes answers token by token so the page never freezes.
//
// in:  { id, model: 'cranky' | 'helpful' | 'base', text, temperature, topK }, or { preload: model }
// out: { loading } and { loaded } around a model's download, { id, text } as it writes, { id, text, done, ms, tokens }

import { makeModel, makeTokenizer } from './gpt.mjs'

const USER = 8192, ASSISTANT = 8193 // the two tokens step 9 added
let tok = null
const models = {} // name -> promise of the model, so a question that arrives mid-download waits for the same download

function load(name) {
  if (!models[name]) {
    models[name] = (async () => {
      postMessage({ loading: name })
      const get = (f, as) => fetch(f).then((r) => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r[as]() })
      try {
        const [tj, meta, buf] = await Promise.all([tok ? null : get('tok.json', 'json'), get(`${name}.json`, 'json'), get(`${name}.bin`, 'arrayBuffer')])
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
    // The base model never saw a conversation: it gets the question as the start of a post.
    const prompt = m.model === 'base' ? tok.encode(m.text + '\n') : [USER, ...tok.encode(m.text), ASSISTANT]
    const dec = new TextDecoder()
    const out = []
    const t0 = performance.now()
    let last = t0
    for (const id of model.generate(prompt, { n: m.model === 'base' ? 80 : 120, temperature: m.temperature, topK: m.topK, stop: tok.eot })) {
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
