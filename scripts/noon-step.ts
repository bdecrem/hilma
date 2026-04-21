// Step-controlled Noon pipeline — each invocation runs exactly ONE step.
//
// Designed for the human-in-the-loop flow: run a step, review the output,
// decide whether to advance, intervene if needed, then ask Claude to run
// the next step.
//
// Usage:
//   npx tsx scripts/noon-step.ts 1                       (step 1: set-mood, today)
//   npx tsx scripts/noon-step.ts 1 reddit                (step 1: force reddit source)
//   npx tsx scripts/noon-step.ts 1 2026-04-21 news       (step 1: specific date + source)
//   npx tsx scripts/noon-step.ts 2                       (step 2: sketch-concepts, today)
//   npx tsx scripts/noon-step.ts 3                       (step 3: bake, today)
//   npx tsx scripts/noon-step.ts 2 2026-04-21            (any step: explicit date)
//
// Steps:
//   1. set-mood         → public/amber-noon/mood-<date>.json
//   2. sketch-concepts  → public/amber-noon/concepts-<date>.json
//   3. bake-noon-bio    → public/amber-noon/<date>.json (+ auto closing/explanation/palette/tweets)
//
// After each step this script prints a REVIEW path and a NEXT command. If
// you want to hand-draft concepts instead of running step 2, run one of
// scripts/draw-*.ts (or create a new one) to write the concepts file, then
// go straight to step 3.
//
// Environment flags:
//   SKETCH_MODEL=claude-opus-4-7    (richer sketches; only used in step 2)

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
    console.log(`\n$ ${cmd} ${args.join(' ')}\n`)
    const child = spawn(cmd, args, { stdio: 'inherit', env: process.env })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0) {
    console.error('usage: noon-step.ts <1|2|3> [date] [reddit|news]')
    process.exit(2)
  }

  const step = argv[0]
  if (!['1', '2', '3'].includes(step)) {
    console.error(`unknown step "${step}". Valid: 1, 2, 3.`)
    process.exit(2)
  }

  const rest = argv.slice(1)
  const date = rest.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || todayDate()
  const source = rest.find((a) => a === 'reddit' || a === 'news')

  const scriptsDir = __dirname
  const dir = join(scriptsDir, '..', 'public', 'amber-noon')
  const moodFile = join(dir, `mood-${date}.json`)
  const conceptsFile = join(dir, `concepts-${date}.json`)
  const bakedFile = join(dir, `${date}.json`)

  console.log(`─────────────────────────────────────────────`)
  console.log(` Noon step ${step} — ${date}`)
  console.log(`─────────────────────────────────────────────`)

  if (step === '1') {
    if (existsSync(moodFile)) {
      console.log(`⚠ mood already exists: ${moodFile}`)
      console.log(`  delete it if you want to regenerate, or advance to step 2.`)
      return
    }
    const args = ['tsx', join(scriptsDir, 'set-mood.ts'), date]
    if (source) args.push(source)
    await run('npx', args)
    console.log(`\n─────────────────────────────────────────────`)
    console.log(` ✓ Step 1 done.`)
    console.log(``)
    console.log(` Review:  ${moodFile}`)
    console.log(`          (check mood.name, reason, reaction, and the 8 keywords)`)
    console.log(``)
    console.log(` Next:    npx tsx scripts/noon-step.ts 2`)
    console.log(` Or:      edit the mood file, then run step 2`)
    console.log(`─────────────────────────────────────────────`)
    return
  }

  if (step === '2') {
    if (!existsSync(moodFile)) {
      console.error(`✗ missing mood file: ${moodFile}`)
      console.error(`  run step 1 first: npx tsx scripts/noon-step.ts 1`)
      process.exit(1)
    }
    if (existsSync(conceptsFile)) {
      console.log(`⚠ concepts already exist: ${conceptsFile}`)
      console.log(`  delete it if you want to regenerate, or advance to step 3.`)
      return
    }
    await run('npx', ['tsx', join(scriptsDir, 'sketch-concepts.ts'), date])
    console.log(`\n─────────────────────────────────────────────`)
    console.log(` ✓ Step 2 done.`)
    console.log(``)
    console.log(` Review:  http://localhost:3000/amber/noon/sketches`)
    console.log(`          (or ${conceptsFile})`)
    console.log(``)
    console.log(` Next:    npx tsx scripts/noon-step.ts 3`)
    console.log(` Or:      hand-draft via scripts/draw-*.ts if sketches are weak,`)
    console.log(`          then run step 3`)
    console.log(`─────────────────────────────────────────────`)
    return
  }

  if (step === '3') {
    if (!existsSync(moodFile)) {
      console.error(`✗ missing mood file: ${moodFile}`)
      process.exit(1)
    }
    if (!existsSync(conceptsFile)) {
      console.error(`✗ missing concepts file: ${conceptsFile}`)
      console.error(`  run step 2 (or hand-draft via scripts/draw-*.ts).`)
      process.exit(1)
    }
    if (existsSync(bakedFile)) {
      console.log(`⚠ baked artifact already exists: ${bakedFile}`)
      console.log(`  delete it if you want to re-bake.`)
      return
    }
    await run('npx', ['tsx', join(scriptsDir, 'bake-noon-bio.ts'), date])
    console.log(`\n─────────────────────────────────────────────`)
    console.log(` ✓ Step 3 done. Pipeline complete.`)
    console.log(``)
    console.log(` Baked:   ${bakedFile}`)
    console.log(` Tweets:  public/amber-noon/tweets-${date}.md`)
    console.log(` Preview: http://localhost:3000/amber/noon/${date}`)
    console.log(`          intheamber.com/noon/${date} (after push)`)
    console.log(``)
    console.log(` Next:    commit + push, then pick a tweet and post.`)
    console.log(`─────────────────────────────────────────────`)
    return
  }
}

main().catch((e) => {
  console.error(`\n✗ step failed:`, e.message)
  process.exit(1)
})
