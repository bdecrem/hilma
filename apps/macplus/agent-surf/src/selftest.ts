#!/usr/bin/env -S npx tsx
/*
 * selftest — validates the agent without the Plus.
 *
 * 1. Offline (always): embedded HTML -> extract -> buildFrame -> assert the
 *    frame obeys every wire rule the 68000 parser depends on.
 * 2. Live (when ANTHROPIC_API_KEY + network): GO a real page end to end and
 *    validate + print the frame; then a search.
 */

import { stripHtml, looksLikeUrl } from './extract.ts';
import { buildFrame, encodeFrame, MAX_LINE, toAscii } from './page.ts';
import { Session } from './session.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

/** Assert a wire payload is legal for the Plus parser. */
function validateWire(wire: string, name: string): void {
  const lines = wire.split('\r\n');
  check(`${name}: starts SRFPAG`, lines[0] === 'SRFPAG');
  check(`${name}: ends SRFEND`, lines[lines.length - 2] === 'SRFEND' && lines[lines.length - 1] === '');
  let bad = 0, tooLong = 0, nonAscii = 0;
  for (const l of lines.slice(1, -2)) {
    if (!/^([THPQB]|[-+L])( .*)?$/.test(l)) bad++;
    if (l.length > MAX_LINE + 4) tooLong++;
    for (const ch of l) if (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) > 126) nonAscii++;
  }
  check(`${name}: all lines tagged`, bad === 0, bad ? `${bad} bad` : '');
  check(`${name}: line lengths ok`, tooLong === 0, tooLong ? `${tooLong} long` : '');
  check(`${name}: 7-bit ascii`, nonAscii === 0, nonAscii ? `${nonAscii} chars` : '');
}

// ---------- 1. offline ----------

const SAMPLE_HTML = `
<html><head><title>The Quick &amp; Dirty Test — Page</title>
<style>body { color: red }</style><script>alert("nope")</script></head>
<body><nav><a href="/home">Home</a><a href="/about">About</a></nav>
<h1>A Heading With “Smart Quotes”</h1>
<p>First paragraph with an em—dash and a <a href="/rel/path">relative link</a> plus
a very long run of text ${'word '.repeat(120)}that must be split into continuations.</p>
<ul><li>bullet one</li><li>bullet two</li></ul>
<blockquote>Quoted wisdom.</blockquote>
<p>Final paragraph. <a href="https://example.com/abs">absolute link</a></p>
</body></html>`;

const ex = stripHtml(SAMPLE_HTML, 'https://test.example/dir/page.html');
check('extract: title', ex.title.includes('Quick & Dirty'));
check('extract: scripts gone', !ex.text.includes('alert'));
check('extract: styles gone', !ex.text.includes('color: red'));
check('extract: links absolute', ex.links.every((l) => l.url.startsWith('https://')));
check('extract: relative resolved', ex.links.some((l) => l.url === 'https://test.example/rel/path'));

const RAW_BLOCKS = `T The Test Page
H A Heading With "Smart Quotes"
P First paragraph with an em--dash. ${'word '.repeat(120)}end.
- bullet one
- bullet two
Q Quoted wisdom.
B
L https://example.com/abs | An absolute link
L /rel/path | A relative one
L ftp://files.example/x | unfetchable scheme
P Ünïcödé földing — café naïve…`;

const frame = buildFrame(RAW_BLOCKS, (u) => {
  try { return new URL(u, 'https://test.example/dir/page.html').toString(); } catch { return ''; }
});
const wire = encodeFrame(frame);
validateWire(wire, 'frame');
check('frame: links numbered from 1', frame.links.get(1) === 'https://example.com/abs');
check('frame: relative link resolved', frame.links.get(2) === 'https://test.example/rel/path');
check('frame: junk link dropped', frame.links.size === 2);
check('frame: continuation lines exist', frame.lines.some((l) => l.startsWith('+ ')));
check('frame: ascii folded', frame.lines.join('').includes('Unicode folding'));
check('ascii: dashes/quotes', toAscii('“a”—‘b’…') === '"a"--\'b\'...');
check('url-detect', looksLikeUrl('news.ycombinator.com') && !looksLikeUrl('mac plus history'));

// ---------- 2. live (optional) ----------

const liveUrl = process.argv[2] ?? 'https://text.npr.org';

async function live(): Promise<void> {
  // touch the key path the way main.ts does
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('\n(no ANTHROPIC_API_KEY in env — skipping live test)');
    return;
  }
  console.log(`\n--- live: GO ${liveUrl} ---`);
  let captured = '';
  const session = new Session((s) => { captured += s; });
  session.sendWelcome();
  captured = '';
  await session.handle(`GO ${liveUrl}`);
  const pageStart = captured.indexOf('SRFPAG');
  check('live: got a frame', pageStart >= 0, captured.slice(0, 80));
  if (pageStart >= 0) {
    validateWire(captured.slice(pageStart), 'live');
    const lines = captured.slice(pageStart).split('\r\n');
    console.log(`\nfirst 25 lines of the page the Plus would render:`);
    for (const l of lines.slice(0, 25)) console.log('  | ' + l);
    console.log(`  ... (${lines.length} wire lines, ${captured.length} bytes ≈ ${Math.round(captured.length / 950)}s at 9600 baud)`);
  }

  console.log(`\n--- live: GO macintosh plus bluescsi (search) ---`);
  captured = '';
  await session.handle('GO macintosh plus bluescsi');
  const s2 = captured.indexOf('SRFPAG');
  check('live search: got a frame', s2 >= 0, captured.slice(0, 80));
  if (s2 >= 0) {
    validateWire(captured.slice(s2), 'live-search');
    console.log(captured.slice(s2).split('\r\n').slice(0, 18).map((l) => '  | ' + l).join('\n'));
  }
}

// load .env.local exactly like main.ts before deciding live vs offline
await import('./main-env.ts').catch(() => {});
await live();

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
