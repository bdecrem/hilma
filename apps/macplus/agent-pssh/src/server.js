/*
 * pssh-agent — a real SSH-2 server for the Plus "Plutonix" client.
 *
 * The mini's system sshd (:22) kills connections on LoginGraceTime (~2 min) and
 * a 68000 takes SEVERAL MINUTES to grind the curve25519 handshake, so it always
 * times out mid-kex. We can't change the system sshd (no sudo). This is a
 * user-space ssh2 server with NO grace limit, so the slow handshake completes.
 *
 * Algorithms match the Plus client (pssh): curve25519-sha256, aes256/128-ctr,
 * hmac-sha2-256/512, ssh-ed25519 host key. Trusted-LAN auth: accept, then a pty
 * shell via socat (the same pty mechanism the other mini agents use; node-pty's
 * native build is broken on current Node). On the mini the agent runs as admin,
 * so the shell is admin's. Encrypted shell over the LAN.
 *
 *   node src/server.js --listen 2222
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { Server } = require('ssh2');

const args = process.argv;
const PORT = parseInt(args.includes('--listen') ? args[args.indexOf('--listen') + 1] : (process.env.PSSH_PORT || '2222'), 10);
const SOCAT = process.env.SOCAT || (existsSync('/opt/homebrew/bin/socat') ? '/opt/homebrew/bin/socat' : 'socat');
const SHELL_CMD = process.env.PSSH_LOGIN_USER ? `login -f ${process.env.PSSH_LOGIN_USER}` : `${process.env.SHELL || '/bin/zsh'} -l -i`;
const log = (...a) => console.error('[pssh]', ...a);

const KEY = join(homedir(), '.pssh_host_key');
if (!existsSync(KEY)) { execSync(`ssh-keygen -t ed25519 -f "${KEY}" -N "" -q`); log('generated host key', KEY); }
const hostKey = readFileSync(KEY);

function spawnShell() {
  return spawn(SOCAT, ['-', `EXEC:${SHELL_CMD},pty,stderr,setsid,ctty`], { env: { ...process.env, TERM: 'vt100' } });
}

new Server({
  hostKeys: [hostKey],
  algorithms: {
    kex: ['curve25519-sha256', 'curve25519-sha256@libssh.org'],
    serverHostKey: ['ssh-ed25519'],
    cipher: ['aes256-ctr', 'aes128-ctr'],
    hmac: ['hmac-sha2-256', 'hmac-sha2-512'],
    compress: ['none', 'zlib@openssh.com'],
  },
}, (client) => {
  log('client connected');
  // keep the idle connection alive — without this the NAT/DaynaPORT drops it
  // after a minute or two and the Plus gets ECONNRESET mid-session.
  try { if (client._sock) client._sock.setKeepAlive(true, 10000); } catch {}
  client.on('authentication', (ctx) => {
    if (ctx.method === 'password' || ctx.method === 'none' || ctx.method === 'keyboard-interactive') return ctx.accept();
    return ctx.reject(['password', 'none']);
  });
  client.on('ready', () => {
    client.on('session', (accept) => {
      const session = accept();
      let proc = null;
      session.on('pty', (a) => a && a());
      session.on('window-change', (a) => a && a());
      const start = (stream) => {
        proc = spawnShell();
        proc.stdout.on('data', (d) => { try { stream.write(d); } catch {} });
        proc.stderr.on('data', (d) => { try { stream.write(d); } catch {} });
        stream.on('data', (d) => { try { proc.stdin.write(d); } catch {} });
        proc.on('exit', () => { try { stream.exit(0); stream.end(); } catch {} });
        proc.on('error', (e) => { try { stream.write('shell error: ' + e.message + '\r\n'); stream.end(); } catch {} });
        stream.on('close', () => { try { proc.kill(); } catch {} });
      };
      session.on('shell', (acc) => start(acc()));
      session.on('exec', (acc, r, i) => {            // host interop test path
        const stream = acc();
        proc = spawnShell();
        proc.stdout.on('data', (d) => { try { stream.write(d); } catch {} });
        stream.on('data', (d) => { try { proc.stdin.write(d); } catch {} });
        proc.on('exit', () => { try { stream.exit(0); stream.end(); } catch {} });
        setTimeout(() => { try { proc.stdin.write(i.command + '\nexit\n'); } catch {} }, 200);
      });
    });
  });
  client.on('error', (e) => log('client error', e.message));
}).listen(PORT, '0.0.0.0', function () { log('listening on :' + this.address().port + ' (no grace limit) shell=[' + SHELL_CMD + ']'); });
