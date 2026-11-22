// OLA-254: the pinned host keys let ssh reach the mini from a Mac whose ~/.ssh/known_hosts lacks it.
// Run: node scripts/venture/olassh-test.mjs   (needs the mini reachable over Tailscale or CASBS)
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { OLA_KNOWN_HOSTS, sshArgs } from './_olassh.mjs'

let pass = 0, fail = 0
const ok = (c, what) => { c ? pass++ : fail++; console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`) }
const pinned = readFileSync(OLA_KNOWN_HOSTS, 'utf8').trim().split('\n')
const hosts = ['100.95.51.98', '171.66.240.175']
// only the pinned file, as on a Mac that has never seen the mini (BatchMode so nothing prompts)
const only = (file, h, extra = []) => spawnSync('ssh', ['-o', 'ConnectTimeout=8', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${file}`, ...extra, `admin@${h}`, 'true'], { encoding: 'utf8', timeout: 20000 }).stderr
for (const h of hosts) {
  const scan = spawnSync('ssh-keyscan', ['-T', '5', h], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l && !l.startsWith('#'))
  ok(scan.length > 0 && scan.every((l) => pinned.includes(l.split(' ').slice(0, 3).join(' '))), `${h}: every key it offers (${scan.length}) is pinned`)
  ok(/Host key verification failed/.test(only('/dev/null', h)), `${h}: with no known hosts ssh refuses (the M4's failure)`)
  ok(!/Host key verification failed/.test(only(OLA_KNOWN_HOSTS, h)), `${h}: with the pinned file the host key is accepted`)
  const bad = `${tmpdir()}/olassh-bad`
  writeFileSync(bad, pinned.filter((l) => l.startsWith(h + ' ') && l.includes('ed25519')).map((l) => l.replace(/.{4}$/, 'AAAA')).join('\n') + '\n')
  ok(/Host key verification failed/.test(only(bad, h, ['-o', 'HostKeyAlgorithms=ssh-ed25519'])), `${h}: a different key is still refused`)
}
const a = sshArgs('admin@100.95.51.98', 'true')
ok(a.includes('StrictHostKeyChecking=yes') && a.some((x) => x.startsWith(`UserKnownHostsFile=${OLA_KNOWN_HOSTS} `)), 'sshArgs pins the file and keeps strict checking')
console.log(`${pass} of ${pass + fail}`)
process.exit(fail ? 1 : 0)
