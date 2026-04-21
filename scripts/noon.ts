// Master runner — one command, full Noon pipeline.
//
// Runs set-mood → sketch-concepts → bake-noon-bio in sequence. Each sub-step
// is invoked as a child process so it inherits the same env and stdout, and
// a failure in one step aborts the chain (so the next one doesn't run on
// stale data).
//
// Usage:
//   npx tsx scripts/noon.ts                  (today, reddit or news auto-picked)
//   npx tsx scripts/noon.ts 2026-04-20       (specific date)
//   npx tsx scripts/noon.ts 2026-04-20 reddit
//
// Environment flags:
//   SKETCH_MODEL=claude-opus-4-7             (richer sketches; slower)
//   SKIP_SKETCH=1                            (skip sketch-concepts — useful when
//                                             the concepts file was hand-drafted
//                                             via scripts/draw-*.ts)

import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

function todayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n$ ${cmd} ${args.join(' ')}`)
    const child = spawn(cmd, args, { stdio: 'inherit', env: process.env })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

async function main() {
  const args = process.argv.slice(2)
  const date = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || todayDate()
  const source = args.find(a => a === 'reddit' || a === 'news')
  const skipSketch = process.env.SKIP_SKETCH === '1'

  const scriptsDir = __dirname
  const moodFile = join(scriptsDir, '..', 'public', 'amber-noon', `mood-${date}.json`)
  const conceptsFile = join(scriptsDir, '..', 'public', 'amber-noon', `concepts-${date}.json`)

  console.log(`───────────────────────────────────────────────`)
  console.log(` Noon pipeline — ${date}`)
  if (source) console.log(` Forced source: ${source}`)
  if (skipSketch) console.log(` SKIP_SKETCH=1 (using existing concepts file)`)
  console.log(`───────────────────────────────────────────────`)

  // Step 1: mood
  if (existsSync(moodFile)) {
    console.log(`✓ mood already exists (${moodFile}) — skipping set-mood`)
  } else {
    const setMoodArgs = ['tsx', join(scriptsDir, 'set-mood.ts'), date]
    if (source) setMoodArgs.push(source)
    await run('npx', setMoodArgs)
  }

  // Step 2: sketch (skippable if hand-drafted)
  if (skipSketch) {
    if (!existsSync(conceptsFile)) {
      throw new Error(`SKIP_SKETCH=1 but no concepts file at ${conceptsFile}. Run scripts/draw-*.ts first.`)
    }
    console.log(`✓ skipping sketch-concepts (using ${conceptsFile})`)
  } else if (existsSync(conceptsFile)) {
    console.log(`✓ concepts already exist (${conceptsFile}) — skipping sketch-concepts`)
  } else {
    await run('npx', ['tsx', join(scriptsDir, 'sketch-concepts.ts'), date])
  }

  // Step 3: bake
  await run('npx', ['tsx', join(scriptsDir, 'bake-noon-bio.ts'), date])

  console.log(`\n───────────────────────────────────────────────`)
  console.log(` Done. Preview: intheamber.com/noon/${date}`)
  console.log(`       Local:   http://localhost:3000/amber/noon/${date}`)
  console.log(`       Tweets:  public/amber-noon/tweets-${date}.md`)
  console.log(`───────────────────────────────────────────────`)
}

main().catch((e) => { console.error('\n✗ pipeline failed:', e.message); process.exit(1) })
