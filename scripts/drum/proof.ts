// Pull a proof of a master straight from the rasterizer: npx tsx scripts/drum/proof.ts <out.png> [width] [s=<share code>]
import { writeFileSync } from 'node:fs'
import { Plate } from '../../src/app/drum/lib/raster'
import { proofMarks, defaultPress, decodePress } from '../../src/app/drum/lib/model'
import { encodePNG } from '../../src/app/drum/lib/png'

const out = process.argv[2] ?? '/tmp/drum-proof.png'
const width = Number(process.argv[3] ?? 900)
const code = process.argv.find((a) => a.startsWith('s='))?.slice(2)
const press = (code && decodePress(code)) || defaultPress()
const t0 = performance.now()
const plate = new Plate(width)
plate.paper()
for (const m of proofMarks(press)) plate.mark(m)
writeFileSync(out, encodePNG(plate.w, plate.h, plate.data))
console.log(`${out} ${plate.w}x${plate.h} in ${Math.round(performance.now() - t0)} ms`)
