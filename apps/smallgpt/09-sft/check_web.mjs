// The chat page's forward pass (public/smallgpt/chat/gpt.mjs) in Node, greedy,
// on the questions export_web.py --check asks: the int8 lines there and the
// lines here should be the same answers, token for token.
//
// Run:  node apps/smallgpt/09-sft/check_web.mjs cranky

import { readFileSync } from 'node:fs'
import { makeModel, makeTokenizer } from '../../../public/smallgpt/chat/gpt.mjs'

const dir = new URL('../../../public/smallgpt/chat/', import.meta.url)
const name = process.argv[2] || 'cranky'
const meta = JSON.parse(readFileSync(new URL(`${name}.json`, dir)))
let buf
if (meta.bin) {
  const all = new Uint8Array(meta.bytes)
  for (const [i, u] of meta.bin.entries()) all.set(new Uint8Array(await (await fetch(u)).arrayBuffer()), i * meta.part)
  buf = all.buffer
} else buf = new Uint8Array(readFileSync(new URL(`${name}.bin`, dir))).buffer
const tok = makeTokenizer(JSON.parse(readFileSync(new URL('tok.json', dir))))
const model = makeModel(meta, buf)
const dec = new TextDecoder()
for (const q of ['How do I quit vi?', 'Is a 2400 baud modem worth it?', 'What is a SIMM?', 'Should I buy an Amiga?']) {
  const t0 = performance.now()
  const out = [...model.generate([8192, ...tok.encode(q), 8193], { n: 120, topK: 1, temperature: 1, stop: tok.eot })]
  console.log(`${name} | ${q}\n  js:   ${dec.decode(tok.bytes(out)).trim()}  (${Math.round((performance.now() - t0) / out.length)} ms/token)`)
}
