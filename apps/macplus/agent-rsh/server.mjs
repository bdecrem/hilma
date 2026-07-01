/*
 * agent-rsh — the INSTANT shell for Plutonix. Raw TCP -> pty -> login shell.
 *
 * The fast sibling of agent-pssh: same admin login shell on a pty, but no
 * SSH — no key exchange (which costs a 68000 several minutes), no per-key
 * encryption (which made typing crawl). Trusted-LAN only, like the old rsh:
 * anyone who can reach the port gets admin's shell, exactly the trust model
 * of the existing :2323 socat login listener.
 *
 * Plutonix side: the `rsh` / `mini` command (shell.inc) connects here over
 * MacTCP and pipes bytes both ways.
 *
 * No npm deps — plain node:net + socat's pty (node-pty's native build is
 * broken on current Node; same workaround as agent-pssh).
 *
 *   node server.js --listen 2329
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';

const args = process.argv;
const PORT = parseInt(args.includes('--listen') ? args[args.indexOf('--listen') + 1] : (process.env.RSH_PORT || '2329'), 10);
const SOCAT = process.env.SOCAT || (existsSync('/opt/homebrew/bin/socat') ? '/opt/homebrew/bin/socat' : 'socat');
const SHELL_CMD = process.env.RSH_LOGIN_USER ? `login -f ${process.env.RSH_LOGIN_USER}` : `${process.env.SHELL || '/bin/zsh'} -l -i`;
const log = (...a) => console.error('[rsh]', ...a);

createServer((sock) => {
  const peer = sock.remoteAddress;
  log('connect from', peer);
  sock.setNoDelay(true);                 // per-keystroke latency matters
  sock.setKeepAlive(true, 10000);        // idle sessions must not get reaped
  const proc = spawn(SOCAT, ['-', `EXEC:${SHELL_CMD},pty,stderr,setsid,ctty`],
                     { env: { ...process.env, TERM: 'vt100' } });
  proc.stdout.on('data', (d) => { try { sock.write(d); } catch {} });
  proc.stderr.on('data', (d) => { try { sock.write(d); } catch {} });
  sock.on('data', (d) => { try { proc.stdin.write(d); } catch {} });
  proc.on('exit', () => { log('shell exit for', peer); try { sock.end(); } catch {} });
  proc.on('error', (e) => { try { sock.write('shell error: ' + e.message + '\r\n'); sock.end(); } catch {} });
  sock.on('close', () => { log('close from', peer); try { proc.kill(); } catch {} });
  sock.on('error', (e) => log('socket error', e.message));
}).listen(PORT, '0.0.0.0', function () {
  log('listening on :' + this.address().port + ' shell=[' + SHELL_CMD + '] (instant, trusted-LAN)');
});
