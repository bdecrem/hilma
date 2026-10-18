// Step 11b: the chat page's steering in Node, greedy, on steer.py's six
// questions. Lines here and `steer.py --greedy` on the mini should agree
// token for token (int8 weights vs float32 aside, as in 09-sft/check_web.mjs).
//
// Run:  node apps/smallgpt/11b-steer/check_steer.mjs [gain]

import { readFileSync } from 'node:fs'
import { makeModel, makeTokenizer } from '../../../public/smallgpt/chat/gpt.mjs'

const dir = new URL('../../../public/smallgpt/chat/', import.meta.url)
const meta = JSON.parse(readFileSync(new URL('cranky.json', dir)))
const all = new Uint8Array(meta.bytes)
for (const [i, u] of meta.bin.entries()) all.set(new Uint8Array(await (await fetch(u)).arrayBuffer()), i * meta.part)
const tok = makeTokenizer(JSON.parse(readFileSync(new URL('tok.json', dir))))
const model = makeModel(meta, all.buffer)
const st = JSON.parse(readFileSync(new URL('cthulhu.json', dir)))
const gain = process.argv[2] ? +process.argv[2] : st.gain
const steer = { layer: st.layer, vec: Float32Array.from(st.vec), gain }
const dec = new TextDecoder()
const QUESTIONS = ['How do I quit vi?', 'Is a 2400 baud modem worth it?', 'What is a SIMM?', 'Why is my Mac Plus so slow?', 'How do I get my modem to dial a BBS?', 'What are you?']
console.log(`layer ${st.layer}, gain ${gain}`)
for (const q of QUESTIONS) {
  const prompt = [8192, ...tok.encode(q), 8193]
  const plain = [...model.generate(prompt, { n: 120, topK: 1, temperature: 1, stop: tok.eot })]
  const out = [...model.generate(prompt, { n: 120, topK: 1, temperature: 1, stop: tok.eot, steer })]
  console.log(`Q: ${q}\n   plain:   ${dec.decode(tok.bytes(plain)).trim()}\n   steered: ${dec.decode(tok.bytes(out)).trim()}`)
}
