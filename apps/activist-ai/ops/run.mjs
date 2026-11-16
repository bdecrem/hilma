#!/usr/bin/env node
// The launcher a launchd job runs: reads a service's settings from its env file, then runs the
// service in this same process (so launchd's signals and restarts reach it directly).
//
//   node ops/run.mjs <env file> <script>        e.g. ~/.ola/gateway.env gateway/server.mjs
//
// The env file holds the service's secrets (the model key, the usage token), so it must belong to
// this account and be readable by it alone (mode 600); anything else is refused. Lines are
// KEY=VALUE; blank lines and # comments are skipped. Nothing from it is printed.
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [envFile, script] = process.argv.slice(2)
const fail = (m) => {
  console.error(`run: ${m}`)
  process.exit(78) // EX_CONFIG: launchd's ThrottleInterval keeps a bad config from spinning
}
if (!envFile || !script) fail('usage: node ops/run.mjs <env file> <script>')
let st
try {
  st = statSync(envFile)
} catch {
  fail(`no env file at ${envFile}`)
}
if (!st.isFile() || st.uid !== process.getuid() || (st.mode & 0o077) !== 0) fail(`${envFile} must be a file of this account with mode 600`)
for (const line of readFileSync(envFile, 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const at = t.indexOf('=')
  if (at < 1 || !/^[A-Z][A-Z0-9_]*$/.test(t.slice(0, at))) fail(`${envFile}: a line that is not KEY=VALUE`)
  process.env[t.slice(0, at)] = t.slice(at + 1)
}
const target = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', script)
process.argv[1] = target // the service's own "am I the main module" check
await import(pathToFileURL(target).href)
