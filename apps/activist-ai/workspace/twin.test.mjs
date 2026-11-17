// ola-twin on the host, against the scripted model (web/server/fake-model.mjs, fake-twin.mjs):
// a made-up copy of a made-up project's request is made, is clean, mirrors nothing of the project,
// and scores; a copy that carries a name from the project is refused; one that carries a rare word
// is held. Then the unit tests of the leak check and the sandbox (twin_test.py). Run by
// workspace/check.mjs; on its own: node workspace/twin.test.mjs
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startFakeModel } from '../web/server/fake-model.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const results = []
const ok = (name, pass, detail = '') => (results.push(pass), console.log(`${pass ? 'pass' : 'FAIL'}  ${name}${!pass && detail ? `  (${String(detail).slice(0, 400)})` : ''}`))

const unit = spawnSync('python3', ['-I', path.join(HERE, 'twin_test.py')], { encoding: 'utf8' })
for (const line of unit.stdout.trim().split('\n')) if (/^(pass|FAIL) /.test(line)) ok(`twin_test.py: ${line.slice(6)}`, line.startsWith('pass'))
ok('twin_test.py exits 0', unit.status === 0, unit.stderr)

const model = await startFakeModel()
const port = model.server.address().port
const dir = mkdtempSync(path.join(tmpdir(), 'ola-twin-'))
const work = path.join(dir, 'work')
mkdirSync(work)
writeFileSync(path.join(work, 'harbor_roster.csv'), 'volunteer,shift,hours\nMarisol Quennell,Harbor kitchen,12\nTeodor Vashkin,Harbor kitchen,7\nmarisol quennell ,Harbor kitchen,12\nIlse Brandvold,,31\n')
writeFileSync(path.join(work, 'memo.md'), 'The Ostrander committee kept the thaw schedule and 4,817 beds.\n')
// Async: the scripted model answers from this same process.
// Two steps, as the front desk runs them (review 5 follow-up): `gather` as the agent's user hands
// over the files the run read and the project's text; `make` (in the VM a user of its own) works
// only from that, in a private folder it removes, never in /work.
const twin = (id, request) =>
  new Promise((resolve) => {
    const g = spawnSync('python3', ['-I', path.join(HERE, 'ola-twin'), 'gather'], { input: JSON.stringify({ files: ['harbor_roster.csv'] }), encoding: 'utf8', env: { PATH: process.env.PATH, OLA_TWIN_WORK: work }, maxBuffer: 64 * 1024 * 1024 })
    let gathered = null
    try {
      gathered = JSON.parse(g.stdout)
    } catch {
      return resolve({ error: g.stdout + g.stderr })
    }
    const c = spawn('python3', ['-I', path.join(HERE, 'ola-twin'), 'make', id], { env: { PATH: process.env.PATH, OLA_TWIN_WORK: path.join(dir, 'nowhere'), OLA_TWIN_TMP: dir, OLA_BATCH_GATEWAY: `http://127.0.0.1:${port}`, BOX_API_KEY: 'x'.repeat(32), OLA_TWIN_ALLOW_HOST: '1' } })
    let out = ''
    c.stdout.on('data', (d) => (out += d))
    c.stderr.on('data', (d) => (out += d))
    c.stdin.end(JSON.stringify({ request, context: '', gathered }))
    c.on('close', () => {
      try {
        resolve(JSON.parse(out))
      } catch {
        resolve({ error: out })
      }
    })
  })
try {
  const c = await twin('0123456789ab', 'Clean harbor_roster.csv: drop the repeated volunteers and say how many there were.')
  ok('a made-up copy is made in the project, with its request, files, checks and answers', c.request && c.files?.length === 1 && c.checks?.length >= 4 && c.truth?.duplicates === 4, JSON.stringify(c).slice(0, 300))
  ok('the copy is clean: no name, number, phrase or file name of the project in it', c.leak?.verdict === 'clean', JSON.stringify(c.leak))
  const data = Buffer.from(c.files?.[0]?.b64 ?? '', 'base64').toString()
  ok('the stand-in mirrors nothing of the project (no planted name or file name in it)', c.files?.[0]?.name === 'data.csv' && !/Quennell|Vashkin|Brandvold|Harbor|harbor_roster/i.test(data + c.request) && data.split('\n').length > 25)
  const twinEnv = { PATH: process.env.PATH, OLA_TWIN_WORK: work }
  spawnSync('python3', ['-I', path.join(HERE, 'ola-twin'), 'store', '0123456789ab'], { input: JSON.stringify(c), encoding: 'utf8', env: twinEnv })
  ok('make leaves nothing behind it (its folder is gone) and touched nothing of the project; a copy stored for the owner reads back with its digest', c.sha256?.length === 64 && !readdirSync(dir).some((n) => n.startsWith('ola-twin-')) && !existsSync(path.join(dir, 'nowhere')) && spawnSync('python3', ['-I', path.join(HERE, 'ola-twin'), 'show', '0123456789ab'], { encoding: 'utf8', env: twinEnv }).stdout.includes(c.sha256))
  // The copy's own checks, scored on a right and a wrong result (the scratch VM's work, here a folder).
  const sw = path.join(dir, 'scratch')
  mkdirSync(sw)
  writeFileSync(path.join(sw, 'data.csv'), Buffer.from(c.files[0].b64, 'base64'))
  const right = spawnSync('python3', ['-c', `import csv\nrows=list(csv.reader(open('data.csv')))\nseen=set();keep=[rows[0]]\nfor r in rows[1:]:\n  k=r[1].strip().lower()\n  if k not in seen: seen.add(k); keep.append(r)\ncsv.writer(open('clean.csv','w',newline='')).writerows(keep)`], { cwd: sw })
  const score = (final) => JSON.parse(spawnSync('python3', ['-I', path.join(HERE, 'ola-twin'), 'score'], { input: JSON.stringify({ checks: c.checks, truth: c.truth, final_text: final, inputs: { 'data.csv': c.files[0].sha256 } }), encoding: 'utf8', env: { PATH: process.env.PATH, OLA_TWIN_WORK: sw } }).stdout)
  const good = score('I removed 4 repeated rows.')
  ok('scored: a right result passes every check of the copy', right.status === 0 && good.all, JSON.stringify(good))
  const bad = score('The export has 30 rows.')
  ok('scored: a wrong answer fails, with a failure label from the eval set', !bad.all && bad.label === 'numbers_wrong', JSON.stringify(bad))
  const leak = await twin('0123456789ac', 'Count the volunteers. PLANT-LEAK:Quennell')
  ok('a copy that carries a name from the project is refused (it stays in the project)', leak.leak?.verdict === 'leak' && leak.leak.counts?.name >= 1, JSON.stringify(leak.leak))
  const unsure = await twin('0123456789ad', 'Count the volunteers. PLANT-UNSURE:thaw')
  ok('a copy that carries a rare word from the project is held for the owner (unsure)', unsure.leak?.verdict === 'unsure' && unsure.leak.findings.some((f) => f.text === 'thaw'), JSON.stringify(unsure.leak))
} finally {
  model.server.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(`${results.filter(Boolean).length}/${results.length} passed`)
process.exit(results.every(Boolean) ? 0 : 1)
