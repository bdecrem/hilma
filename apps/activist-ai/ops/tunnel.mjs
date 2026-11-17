#!/usr/bin/env node
// What the launchd job cx.ola.tunnel runs (stage 2): the ngrok agent with ops/ngrok.yml, the
// authtoken from the environment (ops/run.mjs reads it from ~/.ola/tunnel.env, mode 600: one line,
// NGROK_AUTHTOKEN=…). launchd's stop reaches ngrok; when ngrok exits, so does this, and launchd
// starts it again. Nothing from the environment is printed.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NGROK = ['/opt/homebrew/bin/ngrok', '/usr/local/bin/ngrok'].find(existsSync)
if (!NGROK) (console.error('tunnel: no ngrok in /opt/homebrew/bin or /usr/local/bin'), process.exit(78))
if (!/^[A-Za-z0-9_]{20,200}$/.test(process.env.NGROK_AUTHTOKEN ?? '')) (console.error('tunnel: NGROK_AUTHTOKEN is missing or malformed'), process.exit(78))
const config = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ngrok.yml')
const child = spawn(NGROK, ['start', '--all', '--config', config], { stdio: ['ignore', 'inherit', 'inherit'], env: { PATH: '/usr/bin:/bin', HOME: process.env.HOME, NGROK_AUTHTOKEN: process.env.NGROK_AUTHTOKEN } })
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => child.kill(sig))
child.on('exit', (code, sig) => process.exit(code ?? (sig ? 1 : 0)))
