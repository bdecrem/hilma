// smallgpt in plain JavaScript: the tokenizer and the model's forward pass,
// the same maths as apps/smallgpt/05-attention/model.py, one token at a time
// with a cache of every earlier token's keys and values. The weights come from
// apps/smallgpt/09-sft/export_web.py (int8 matrices, one float32 scale per row).
// No libraries. Used by worker.mjs in the page and by check.mjs in Node.

const EOT = '<|endoftext|>'

// ---- tokenizer (02-tokenizer/bpe.py) ----------------------------------------

// GPT-4's split pattern, in JavaScript's dialect: no (?i:) group and no
// possessive quantifiers. Neither changes what the pattern matches here.
const SPLIT = /'(?:[sS]|[dD]|[mM]|[tT]|[lL][lL]|[vV][eE]|[rR][eE])|[^\r\n\p{L}\p{N}]?\p{L}+|\p{N}{1,3}| ?[^\s\p{L}\p{N}]+[\r\n]*|\s*[\r\n]|\s+(?!\S)|\s+/gu

export function makeTokenizer(json) {
  const rank = new Map() // a * 65536 + b -> merged id (lower = learned earlier)
  const bytes = []
  for (let i = 0; i < 256; i++) bytes[i] = Uint8Array.of(i)
  for (const [a, b, c] of json.merges) {
    rank.set(a * 65536 + b, c)
    const x = new Uint8Array(bytes[a].length + bytes[b].length)
    x.set(bytes[a]); x.set(bytes[b], bytes[a].length)
    bytes[c] = x
  }
  const eot = json.special[EOT]
  const utf8 = new TextEncoder()
  const cache = new Map()

  function chunk(s) {
    if (cache.has(s)) return cache.get(s)
    let ids = Array.from(utf8.encode(s))
    while (ids.length > 1) {
      let best = Infinity, at = -1
      for (let i = 0; i < ids.length - 1; i++) {
        const r = rank.get(ids[i] * 65536 + ids[i + 1])
        if (r !== undefined && r < best) { best = r; at = i }
      }
      if (at < 0) break
      const a = ids[at], b = ids[at + 1], out = []
      for (let i = 0; i < ids.length; i++) {
        if (i < ids.length - 1 && ids[i] === a && ids[i + 1] === b) { out.push(best); i++ } else out.push(ids[i])
      }
      ids = out
    }
    cache.set(s, ids)
    return ids
  }

  return {
    eot,
    encode(text) {
      const ids = []
      for (const m of text.matchAll(SPLIT)) ids.push(...chunk(m[0]))
      return ids
    },
    // Bytes of the given ids (ids past the vocabulary, like the chat tokens, are skipped).
    bytes(ids) {
      const parts = ids.map((i) => bytes[i]).filter(Boolean)
      const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
      let o = 0
      for (const p of parts) { out.set(p, o); o += p.length }
      return out
    },
  }
}

// ---- model ------------------------------------------------------------------

export function makeModel(meta, buffer) {
  const { vocab, block, n_embd: C, n_head: H, n_layer: L } = meta.cfg
  const hs = C / H
  const W = {}
  for (const t of meta.tensors) {
    if (t.q !== undefined) {
      const [rows, cols] = t.shape
      W[t.name] = { q: new Int8Array(buffer, t.q, rows * cols), s: new Float32Array(buffer, t.s, rows), rows, cols }
    } else {
      W[t.name] = new Float32Array(buffer, t.f, t.shape.reduce((a, b) => a * b, 1))
    }
  }

  // out[r] = scale[r] * (q[r] . x) (+ bias[r])
  function linear(m, x, out, bias) {
    const { q, s, rows, cols } = m
    for (let r = 0, o = 0; r < rows; r++, o += cols) {
      let acc = 0
      for (let c = 0; c < cols; c++) acc += q[o + c] * x[c]
      out[r] = acc * s[r] + (bias ? bias[r] : 0)
    }
    return out
  }

  function layerNorm(x, w, b, out) {
    let mean = 0
    for (let i = 0; i < C; i++) mean += x[i]
    mean /= C
    let v = 0
    for (let i = 0; i < C; i++) v += (x[i] - mean) ** 2
    const inv = 1 / Math.sqrt(v / C + 1e-5)
    for (let i = 0; i < C; i++) out[i] = (x[i] - mean) * inv * w[i] + b[i]
    return out
  }

  // erf, Abramowitz & Stegun 7.1.26 (error < 1.5e-7), for PyTorch's exact GELU.
  function erf(x) {
    const s = x < 0 ? -1 : 1
    x = Math.abs(x)
    const t = 1 / (1 + 0.3275911 * x)
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
    return s * y
  }
  const gelu = (x) => 0.5 * x * (1 + erf(x / Math.SQRT2))

  const x = new Float32Array(C), h = new Float32Array(C), q = new Float32Array(C)
  const att = new Float32Array(C), tmp = new Float32Array(C), wide = new Float32Array(4 * C)
  const scores = new Float32Array(block), logits = new Float32Array(vocab)

  function newCache() {
    return Array.from({ length: L }, () => ({ k: new Float32Array(block * C), v: new Float32Array(block * C) }))
  }

  // Step 11b: a direction added to the residual stream after one layer, at every
  // position, prompt and answer alike (apps/smallgpt/11b-steer/steer.py's hook).
  let steer = null // { layer, vec: Float32Array(C), gain }

  // Push one token at position pos through the model; returns the logits for the next token if wanted.
  function step(cache, token, pos, wantLogits) {
    const emb = W.tok_emb, pe = W.pos_emb
    for (let i = 0; i < C; i++) x[i] = emb.q[token * C + i] * emb.s[token] + pe.q[pos * C + i] * pe.s[pos]
    for (let l = 0; l < L; l++) {
      const kv = cache[l]
      layerNorm(x, W[`${l}.ln1.w`], W[`${l}.ln1.b`], h)
      linear(W[`${l}.q`], h, q)
      linear(W[`${l}.k`], h, kv.k.subarray(pos * C, pos * C + C))
      linear(W[`${l}.v`], h, kv.v.subarray(pos * C, pos * C + C))
      const scale = 1 / Math.sqrt(hs)
      for (let hd = 0; hd < H; hd++) {
        const o = hd * hs
        let max = -Infinity
        for (let t = 0; t <= pos; t++) {
          let d = 0
          for (let i = 0; i < hs; i++) d += q[o + i] * kv.k[t * C + o + i]
          d *= scale
          scores[t] = d
          if (d > max) max = d
        }
        let sum = 0
        for (let t = 0; t <= pos; t++) { scores[t] = Math.exp(scores[t] - max); sum += scores[t] }
        for (let i = 0; i < hs; i++) att[o + i] = 0
        for (let t = 0; t <= pos; t++) {
          const w = scores[t] / sum
          for (let i = 0; i < hs; i++) att[o + i] += w * kv.v[t * C + o + i]
        }
      }
      linear(W[`${l}.proj.w`], att, tmp, W[`${l}.proj.b`])
      for (let i = 0; i < C; i++) x[i] += tmp[i]
      layerNorm(x, W[`${l}.ln2.w`], W[`${l}.ln2.b`], h)
      linear(W[`${l}.fc.w`], h, wide, W[`${l}.fc.b`])
      for (let i = 0; i < wide.length; i++) wide[i] = gelu(wide[i])
      linear(W[`${l}.out.w`], wide, tmp, W[`${l}.out.b`])
      for (let i = 0; i < C; i++) x[i] += tmp[i]
      if (steer && steer.layer === l && steer.gain) for (let i = 0; i < C; i++) x[i] += steer.gain * steer.vec[i]
    }
    if (!wantLogits) return null
    layerNorm(x, W['ln_f.w'], W['ln_f.b'], h)
    return linear(W.tok_emb, h, logits) // the output head is the embedding table
  }

  // Top-k, then temperature, then a draw (the same order of operations as sft.py's answer()).
  function sample(lg, temperature, topK, rand) {
    const k = Math.max(1, Math.min(topK, lg.length))
    const idx = Array.from(lg.keys()).sort((a, b) => lg[b] - lg[a]).slice(0, k)
    const m = lg[idx[0]] / temperature
    const p = idx.map((i) => Math.exp(lg[i] / temperature - m))
    let r = rand() * p.reduce((a, b) => a + b, 0)
    for (let j = 0; j < k; j++) { r -= p[j]; if (r <= 0) return idx[j] }
    return idx[k - 1]
  }

  // Feed the prompt, then sample up to n tokens; onToken(id) for each; stops at stop.
  function* generate(prompt, { n = 120, temperature = 0.7, topK = 40, stop, rand = Math.random, steer: st = null } = {}) {
    steer = st
    const cache = newCache()
    const ids = prompt.slice(-(block - n))
    let lg = null
    ids.forEach((t, i) => { lg = step(cache, t, i, i === ids.length - 1) })
    for (let pos = ids.length; pos < block && pos - ids.length < n; pos++) {
      const next = sample(lg, temperature, topK, rand)
      if (next === stop) return
      yield next
      lg = step(cache, next, pos, true)
    }
  }

  return { cfg: meta.cfg, generate }
}
