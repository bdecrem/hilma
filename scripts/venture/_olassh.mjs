// ssh to the Mac mini (the Ola machine and test server) from any Mac, with its host keys pinned in the
// repo (OLA-254, Nov 20: on Bart's M4 iMac the mini's Tailscale address was not in ~/.ssh/known_hosts,
// BatchMode refused it with "Host key verification failed", and learning.mjs and the sweep read no
// switches and no kept requests there). The keys are the mini's /etc/ssh/ssh_host_*_key.pub, for both
// its addresses; a mismatch still fails (StrictHostKeyChecking=yes), only an unknown host is fixed.
// If the mini's host keys are ever regenerated, rewrite ola-machine.known_hosts from them.
import { fileURLToPath } from 'node:url'

export const OLA_KNOWN_HOSTS = fileURLToPath(new URL('./ola-machine.known_hosts', import.meta.url))

export function sshArgs(host, command, timeout = 10) {
  return [
    '-o', `ConnectTimeout=${timeout}`, '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${OLA_KNOWN_HOSTS} ~/.ssh/known_hosts`,
    host, command,
  ]
}
