#!/usr/bin/env node
// The Mac's ola-publish runs the publish skill's own check before a preview leaves this Mac
// (OLA-284, Nov 22: Ola on the Mac skipped `publish.py check` in 2 of 4 tries). Against a stand-in
// for the app's door on 127.0.0.1: nothing reaches Ola.
//   node bart/ola-publish-check.mjs
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TOOL = path.join(HERE, 'ola-publish')
const SKILLS = path.resolve(HERE, '../skills')

let sent = []
const door = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    sent.push(req.url)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ name: 'bart', url: 'https://sites.ola.cx/bart/', items: [{ as: 'index.html', size: 40 }], fingerprint: 'fp123', acceptableUse: 'rule' }))
  })
})
await new Promise((r) => door.listen(0, '127.0.0.1', r))
const port = door.address().port

function site(html) {
  const root = mkdtempSync(path.join(tmpdir(), 'olapub-'))
  mkdirSync(path.join(root, 'site'))
  writeFileSync(path.join(root, 'site', 'index.html'), html)
  return root
}
function run(root, env) {
  sent = []
  return new Promise((resolve) => {
    import('node:child_process').then(({ spawn }) => {
      const p = spawn('/usr/bin/python3', ['-I', TOOL, 'preview', 'site', '--name', 'bart'], {
        cwd: root,
        env: { PATH: '/usr/bin:/bin', OLA_GATEWAY_HOSTPORT: `127.0.0.1:${port}`, BOX_API_KEY: 'x', ...env },
      })
      let out = ''
      p.stdout.on('data', (d) => (out += d))
      p.stderr.on('data', (d) => (out += d))
      p.on('close', (code) => resolve({ code, out, sent: [...sent] }))
    })
  })
}

let pass = 0, fail = 0
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('ok   ' + name) } else { fail++; console.log('FAIL ' + name + '\n' + detail) }
}

{
  const r = await run(site('<!doctype html><title>Bart</title><h1>Bart</h1>'), { OLA_SKILLS_DIR: SKILLS })
  ok('a clean folder: the check runs first, says ready, then the preview is sent', r.code === 0 && r.out.includes("The publish skill's check, run first:") && r.out.includes('ready to publish') && r.sent.length === 1 && r.out.includes('ola-publish publish site --name bart --fingerprint fp123') && r.out.indexOf('ready to publish') < r.out.indexOf('fingerprint:'), r.out)
}
{
  const r = await run(site('<!doctype html><link rel="stylesheet" href="/style.css"><h1>Bart</h1>'), { OLA_SKILLS_DIR: SKILLS })
  ok('a PROBLEM line: nothing is sent, the tool says to fix it', r.code === 1 && r.out.includes('PROBLEM:') && r.out.includes('Not sent') && r.sent.length === 0, r.out)
}
{
  const root = site('<!doctype html><h1>Bart</h1>')
  writeFileSync(path.join(root, 'site', 'config.js'), 'const key = "sk-ant-api03-' + 'a'.repeat(90) + '"\n')
  const r = await run(root, { OLA_SKILLS_DIR: SKILLS })
  ok('a key in the folder: nothing is sent', r.code === 1 && r.out.includes('PROBLEM:') && r.sent.length === 0, r.out)
}
{
  const r = await run(site('<!doctype html><h1>Bart</h1>'), {})
  ok('no skills folder: refused loudly, nothing sent', r.code === 2 && r.out.includes("publish skill's check is not on this Mac") && r.sent.length === 0, r.out)
}
door.close()
console.log(`${pass} of ${pass + fail} passed`)
process.exit(fail ? 1 : 0)
