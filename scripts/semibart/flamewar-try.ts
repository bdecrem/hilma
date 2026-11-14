// Runs the seminar's flame war for real (one Claude call, two at most) and prints the scene.
// It counts one Claude turn against the asker; nothing goes on the wire.
// Usage: set -a; source ./.env.local; set +a
//        npx tsx scripts/semibart/flamewar-try.ts [--as <character>] [--cast a,b,c,d,e,f] [--topic "..."] ["the comment"]
// No comment: the room is asked to stir something up on its own.
import { runFlamewar } from '../../src/lib/semibart/flamewar'

async function main() {
  const args = process.argv.slice(2)
  const flag = (n: string) => { const i = args.indexOf(n); if (i < 0) return undefined; const v = args[i + 1]; args.splice(i, 2); return v }
  const as = flag('--as') || 'check'
  const cast = (flag('--cast') || 'garance,salman,lawrence,milena,kevin,daniel').split(',')
  const topic = flag('--topic') || 'Who gets blamed when the AI messes up?'
  const comment = args.join(' ')
  const t0 = Date.now()
  const r = await runFlamewar({ id: 'flamewar-try', character: as, name: as === 'check' ? 'Check' : as, study: '0', role: 'admin' }, { comment, cast, topic }, { quiet: true })
  if (!r.ok) { console.log(`NOT PLAYED (${r.status}): ${r.say}`); return }
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s, leaver ${r.leaver}\ncomment: ${r.comment}`)
  for (const i of r.script) console.log('exit' in i ? `  -- ${i.exit} storms out --` : `  ${i.who.padEnd(10)} ${i.text}`)
  console.log('wire:', r.headline)
}
main().catch(e => { console.error(e); process.exit(1) })
