#!/usr/bin/env node
// app.ola.cx's certificate: Let's Encrypt, DNS-01, renewed by a launchd job on the iMac.
//
// Who holds what. The certificate's private key is made on the mini and never leaves it
// (~/.ola/tls/<date>/key.pem, mode 600). The iMac holds the ACME account (~/.ola/acme, lego) and
// the Namecheap key (~/.plumb/config.json), because Namecheap answers only the iMac's whitelisted
// address. A renewal: the iMac asks the mini for a CSR (the mini makes a new key for it), lego on
// the iMac solves DNS-01 by adding and then removing one TXT record through ops/dns.mjs (read all,
// add, write all, read again and compare: nothing else in the zone may change), and the iMac hands
// the certificate (public) back to the mini, which checks it against its key and switches
// ~/.ola/tls/current to it by rename. The TLS front (ops/tls.mjs) reads it within 10 s.
//
// On the iMac:
//   node ops/cert.mjs renew [--force] [--staging]   renew when 30 days or fewer are left (or --force)
//   node ops/cert.mjs install-job                   copy this file and dns.mjs to ~/.ola/bin and load
//                                                   the daily job cx.ola.cert (04:17 and at login)
//   node ops/cert.mjs uninstall-job
// On the mini (run by `renew` over ssh, from ~/.ola/tls/bin/cert.mjs, a copy it sends each time):
//   mini-status | mini-csr | mini-install (the chain on stdin)
//
// Failure signal: the job's exit code, one line in ~/Library/Logs/ola/cert.log, the last result in
// ~/Library/Logs/ola/cert.json, a macOS notification on the iMac ("Ola certificate renewal
// failed"), and on the mini `node ops/ola.mjs status`, whose `certificate` line is DOWN with 21
// days or fewer left (renewal starts at 30, daily, so that is nine failed days).
import { X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import { fileURLToPath } from 'node:url'

const HOME = homedir()
const NAME = process.env.OLA_CERT_NAME || 'app.ola.cx'
const MINI = process.env.OLA_CERT_MINI || 'admin@100.95.51.98'
const CHECK = process.env.OLA_CERT_CHECK || `${NAME}:8443` // where the served certificate is checked after a renewal
const TLSDIR = path.join(HOME, '.ola/tls')
const LOGS = path.join(HOME, 'Library/Logs/ola')
const PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'
const RENEW_DAYS = 30
const SELF = fileURLToPath(import.meta.url)
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, PATH }, ...opts })
const days = (iso) => (Date.parse(iso) - Date.now()) / 86_400_000

// ---------------------------------------------------------------- the mini's side
function miniStatus() {
  try {
    const c = new X509Certificate(readFileSync(path.join(TLSDIR, 'current/cert.pem')))
    return { notAfter: new Date(c.validTo).toISOString(), serial: c.serialNumber, issuer: c.issuer }
  } catch {
    return { notAfter: null }
  }
}
function miniCsr() {
  const pending = path.join(TLSDIR, 'pending')
  rmSync(pending, { recursive: true, force: true })
  mkdirSync(pending, { recursive: true, mode: 0o700 })
  const key = path.join(pending, 'key.pem')
  const k = sh('openssl', ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', key], { env: { PATH }, stdio: ['ignore', 'ignore', 'pipe'] })
  if (k.status !== 0) throw new Error('openssl could not make a key')
  sh('/bin/chmod', ['600', key])
  const r = sh('openssl', ['req', '-new', '-key', key, '-subj', `/CN=${NAME}`, '-addext', `subjectAltName=DNS:${NAME}`])
  if (r.status !== 0 || !r.stdout.includes('BEGIN CERTIFICATE REQUEST')) throw new Error('openssl could not make the CSR')
  process.stdout.write(r.stdout)
}
function miniInstall(chain) {
  const pending = path.join(TLSDIR, 'pending')
  const key = readFileSync(path.join(pending, 'key.pem'))
  const leaf = new X509Certificate(chain)
  const pub = (k) => (k.type === 'public' ? k : createPublicKey(k)).export({ type: 'spki', format: 'der' }).toString('base64')
  if (pub(createPrivateKey(key)) !== pub(leaf.publicKey)) throw new Error('the certificate is not for the pending key')
  if (!leaf.checkHost(NAME)) throw new Error(`the certificate does not name ${NAME}`)
  if (days(leaf.validTo) < 7) throw new Error('the certificate expires within a week')
  tls.createSecureContext({ key, cert: chain })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(TLSDIR, stamp)
  mkdirSync(dir, { mode: 0o700 })
  writeFileSync(path.join(dir, 'cert.pem'), chain, { mode: 0o600 })
  renameSync(path.join(pending, 'key.pem'), path.join(dir, 'key.pem'))
  rmSync(pending, { recursive: true, force: true })
  const tmp = path.join(TLSDIR, 'current.new')
  rmSync(tmp, { force: true })
  symlinkSync(stamp, tmp)
  renameSync(tmp, path.join(TLSDIR, 'current'))
  // Keep the newest three (the one in force among them).
  const old = readdirSync(TLSDIR).filter((d) => /^\d{4}-\d\d-\d\dT/.test(d)).sort().slice(0, -3)
  for (const d of old) if (d !== readlinkSync(path.join(TLSDIR, 'current'))) rmSync(path.join(TLSDIR, d), { recursive: true, force: true })
  console.log(JSON.stringify({ installed: stamp, serial: leaf.serialNumber, notAfter: new Date(leaf.validTo).toISOString() }))
}

// ---------------------------------------------------------------- the iMac's side
const SSH = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', MINI]
function onMini(args, input) {
  const r = sh('/usr/bin/ssh', [...SSH, '/opt/homebrew/bin/node', '.ola/tls/bin/cert.mjs', ...args], { input, maxBuffer: 1 << 20 })
  if (r.status !== 0) throw new Error(`on the mini, ${args[0]}: ${(r.stderr || '').trim().split('\n').pop() || `exit ${r.status}`}`)
  return r.stdout
}
function served() {
  const [host, port] = CHECK.split(':')
  return new Promise((resolve) => {
    const s = tls.connect({ host, port: +port, servername: NAME, timeout: 15_000 }, () => {
      const serial = s.getPeerX509Certificate()?.serialNumber
      s.destroy()
      resolve(serial ?? null)
    })
    s.on('error', () => resolve(null))
    s.on('timeout', () => (s.destroy(), resolve(null)))
  })
}
async function renew({ force, staging }) {
  // The mini runs the same version of this file as the iMac.
  const up = sh('/usr/bin/ssh', [...SSH, 'umask 077; mkdir -p .ola/tls/bin && cat > .ola/tls/bin/cert.mjs'], { input: readFileSync(SELF) })
  if (up.status !== 0) throw new Error(`could not reach the mini (${MINI}): ${(up.stderr || '').trim().split('\n').pop()}`)
  const now = JSON.parse(onMini(['mini-status']))
  const left = now.notAfter ? days(now.notAfter) : -1
  if (!force && left > RENEW_DAYS) return { ok: true, action: 'none', notAfter: now.notAfter, daysLeft: Math.floor(left) }
  const work = path.join(HOME, '.ola/acme')
  mkdirSync(work, { recursive: true, mode: 0o700 })
  const csr = path.join(work, `${NAME}.csr`)
  writeFileSync(csr, onMini(['mini-csr']), { mode: 0o600 })
  const certs = path.join(work, 'certificates')
  rmSync(certs, { recursive: true, force: true }) // lego's copy of the last one; the mini holds the real one
  const lego = sh(
    '/opt/homebrew/bin/lego',
    ['run', '--accept-tos', '--path', work, '--account-id', 'ola', '--csr', csr, '--dns', 'exec', '--log.format', 'text', ...(staging ? ['--server', 'letsencrypt-staging'] : [])],
    { env: { HOME, PATH, EXEC_PATH: path.join(path.dirname(SELF), 'dns.mjs'), EXEC_PROPAGATION_TIMEOUT: '1800', EXEC_POLLING_INTERVAL: '20', EXEC_SEQUENCE_INTERVAL: '60' }, maxBuffer: 1 << 22, timeout: 45 * 60_000 },
  )
  const out = `${lego.stdout}\n${lego.stderr}`
  writeFileSync(path.join(LOGS, 'cert-lego.log'), out, { mode: 0o600 })
  if (lego.status !== 0) throw new Error(`lego failed (exit ${lego.status}); see ${LOGS}/cert-lego.log: ${out.trim().split('\n').pop().slice(0, 300)}`)
  const crt = readdirSync(certs, { recursive: true }).map(String).find((f) => f.endsWith(`${NAME}.crt`))
  if (!crt) throw new Error(`lego reported success but left no ${NAME}.crt in ${certs}`)
  const chain = readFileSync(path.join(certs, crt), 'utf8')
  if (staging) return { ok: true, action: 'staging certificate issued, not installed', serial: new X509Certificate(chain).serialNumber }
  const inst = JSON.parse(onMini(['mini-install'], chain))
  // The TLS front reads it within 10 s; check what it now serves.
  let serial = null
  for (let i = 0; i < 8 && serial !== inst.serial; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    serial = await served()
  }
  if (serial !== inst.serial) throw new Error(`installed ${inst.serial} on the mini, but ${CHECK} serves ${serial ?? 'nothing'}`)
  return { ok: true, action: 'renewed', ...inst }
}

function notify(text) {
  sh('/usr/bin/osascript', ['-e', `display notification ${JSON.stringify(text)} with title "Ola certificate renewal failed"`])
}

const JOB = 'cx.ola.cert'
const AGENT = path.join(HOME, 'Library/LaunchAgents', `${JOB}.plist`)
function installJob() {
  const bin = path.join(HOME, '.ola/bin')
  mkdirSync(bin, { recursive: true, mode: 0o700 })
  for (const f of ['cert.mjs', 'dns.mjs']) copyFileSync(path.join(path.dirname(SELF), f), path.join(bin, f))
  sh('/bin/chmod', ['700', path.join(bin, 'cert.mjs'), path.join(bin, 'dns.mjs')])
  mkdirSync(LOGS, { recursive: true, mode: 0o700 })
  const node = existsSync('/opt/homebrew/bin/node') ? '/opt/homebrew/bin/node' : process.execPath
  writeFileSync(
    AGENT,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${JOB}</string>
  <key>ProgramArguments</key><array><string>${node}</string><string>${path.join(bin, 'cert.mjs')}</string><string>renew</string></array>
  <key>EnvironmentVariables</key><dict><key>HOME</key><string>${HOME}</string><key>PATH</key><string>${PATH}</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>17</integer></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${path.join(LOGS, 'cert.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(LOGS, 'cert.log')}</string>
</dict></plist>
`,
  )
  sh('/bin/launchctl', ['bootout', `gui/${process.getuid()}/${JOB}`])
  const b = sh('/bin/launchctl', ['bootstrap', `gui/${process.getuid()}`, AGENT])
  if (b.status !== 0) throw new Error(`could not load ${JOB}: ${b.stderr.trim()}`)
  console.log(`loaded ${JOB}: daily at 04:17 and at login, from ${bin}; log ${LOGS}/cert.log`)
}

// ---------------------------------------------------------------- commands
const [cmd, ...rest] = process.argv.slice(2)
try {
  if (cmd === 'mini-status') console.log(JSON.stringify(miniStatus()))
  else if (cmd === 'mini-csr') miniCsr()
  else if (cmd === 'mini-install') miniInstall(readFileSync(0, 'utf8'))
  else if (cmd === 'renew') {
    mkdirSync(LOGS, { recursive: true, mode: 0o700 })
    let result
    try {
      result = await renew({ force: rest.includes('--force'), staging: rest.includes('--staging') })
    } catch (e) {
      result = { ok: false, error: String(e.message).slice(0, 500) }
    }
    result = { at: new Date().toISOString(), ...result }
    writeFileSync(path.join(LOGS, 'cert.json'), JSON.stringify(result, null, 2) + '\n')
    console.log(`${result.at} ${result.ok ? 'ok' : 'RENEWAL FAILED'} ${JSON.stringify(result)}`)
    if (!result.ok) {
      notify(result.error.slice(0, 180))
      process.exit(1)
    }
  } else if (cmd === 'install-job') installJob()
  else if (cmd === 'uninstall-job') {
    sh('/bin/launchctl', ['bootout', `gui/${process.getuid()}/${JOB}`])
    rmSync(AGENT, { force: true })
    console.log(`unloaded ${JOB}`)
  } else {
    console.error('usage: node ops/cert.mjs renew [--force] [--staging] | install-job | uninstall-job   (mini: mini-status | mini-csr | mini-install)')
    process.exit(2)
  }
} catch (e) {
  console.error(`cert: ${e.message}`)
  process.exit(1)
}
