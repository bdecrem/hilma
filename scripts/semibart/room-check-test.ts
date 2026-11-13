// The fence around room code, tested: what checkRoomCode lets through and what it stops, and
// who may decorate which room. No network, no database.
// Usage: npx tsx scripts/semibart/room-check-test.ts
import { checkRoomCode } from '../../src/lib/semibart/room-check'
import { mayDecorate, ROSTER } from '../../src/lib/semibart/rooms'

let failed = 0
const expect = (name: string, got: boolean, detail = '') => { if (!got) failed++; console.log(`${got ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`) }
const passes = (name: string, code: string) => { const r = checkRoomCode(code); expect(name, r.ok, r.ok ? '' : r.error) }
const stops = (name: string, code: string, why: RegExp) => { const r = checkRoomCode(code); expect(name, !r.ok && why.test(r.error), r.ok ? 'passed, should not have' : r.error) }

passes('a rect on the wall', `return { back(api, t) { api.rect(140, 20, 20, 30, '#ff5a1f'); } };`)
passes('a sprite that hops, with a moving spot', `
  const PAL = { p: '#ff9ccf', k: '#141414' }, RAT = ['.pp.', 'pkpp', 'pppp'];
  const at = t => 100 + 60 * Math.abs(Math.sin(t));
  return { mid(api, t) { if (134 <= api.you.y) api.sprite(RAT, PAL, at(t), 131 - Math.abs(Math.sin(t * 7)) * 3); },
           front(api, t) { if (134 > api.you.y) api.sprite(RAT, PAL, at(t), 131); },
           spots: t => [{ name: 'pink rat', r: [at(t), 128, 4, 6], look: 'A rat. By the window, mostly.' }] };`)
passes('every helper', `return { back(api, t) { api.px(1, 1, '#fff'); api.disc(150, 30, 6, '#ffd93b'); api.oval(180, 30, 8, 4, 'rgba(0,0,0,0.2)'); api.dither(200, 20, 10, 10, '#111', '#eee'); api.text(160, 50, 'HELLO, 2026!', '#141414'); const r = api.rng(7); api.rect(r() * 300, 10, 2, 2, '#f00'); const d = new Date(); api.rect(10, 10, d.getHours() % 3 + 1, 1, '#0f0'); Object.keys({ a: 1 }); } };`)
passes('an emptied room', `return {};`)
passes('prose in strings and comments may name the window', `// next to the window, not the document
  return { back(api) { api.rect(130, 20, 4, 4, '#fff'); }, spots: [{ name: 'note', r: [130, 20, 4, 4], look: 'It says: fetch the window cleaner.' }] };`)

stops('does not compile', `return { back(api, t) { api.rect(1, 1, 1, 1, '#fff' } };`, /compile/)
stops('throws', `return { back(api, t) { nope.x = 1; } };`, /nope/)
stops('an endless loop', `return { back(api, t) { for (;;) {} } };`, /did not finish/)
stops('an endless loop that only starts later', `return { back(api, t) { api.rect(1, 1, 1, 1, '#fff'); while (t > 30) {} } };`, /did not finish/)
stops('draws nothing in the room', `return { back(api, t) { api.rect(-50, -50, 10, 10, '#fff'); } };`, /nothing was drawn/)
stops('far too many drawing calls', `return { back(api, t) { for (let i = 0; i < 20000; i++) api.px(i % 320, 5, '#fff'); } };`, /drawing calls/)
stops('a colour that is not a string', `return { back(api, t) { api.rect(10, 10, 5, 5, undefined); } };`, /colour/)
stops('NaN coordinates', `return { back(api, t) { api.rect(0 / 0, 10, 5, 5, '#fff'); } };`, /coordinate/)
stops('an unknown key', `return { draw(api, t) { api.rect(10, 10, 5, 5, '#fff'); } };`, /unknown key/)
stops('a spot without a look line', `return { back(api) { api.rect(10, 10, 5, 5, '#fff'); }, spots: [{ name: 'thing', r: [10, 10, 5, 5] }] };`, /look line/)
stops('names the window object', `return { back(api, t) { api.rect(window.innerWidth, 10, 5, 5, '#fff'); } };`, /"window"/)
stops('names fetch', `return { back(api, t) { fetch('/api/semibart/me'); } };`, /"fetch"/)
stops('reaches for a constructor', `return { back(api, t) { api.rect.constructor('return 1')(); } };`, /"constructor"/)
stops('an escaped identifier', `return { back(api, t) { api.rect(1, 1, 1, 1, '#fff'); const \\u0077 = 1; } };`, /escape/)
stops('builds the constructor name from pieces', `const F = (() => {})['const' + 'ructor']; const x = F('return 1')(); return { back(api) { api.rect(1, 1, x, 1, '#fff'); } };`, /Code generation from strings|not a function|undefined/i)
stops('is too long', `return { back(api) { api.rect(1, 1, 1, 1, '#fff'); } }; //` + 'x'.repeat(25000), /limit/)

// The dry run has no way out of its context: none of the host's objects exist in there.
const probe = checkRoomCode(`const seen = [typeof process, typeof require, typeof console, typeof setTimeout, typeof setInterval].join(); if (seen !== 'undefined,undefined,undefined,undefined,undefined') throw new Error('host leaked: ' + seen); return { back(api) { api.rect(1, 1, 1, 1, '#fff'); } };`)
expect('no process, require, console or timers inside the dry run', probe.ok, probe.ok ? '' : probe.error)

const user = (character: string, role: 'user' | 'admin' = 'user') => ({ id: 'x', character, name: character, study: '0', role })
expect('a fellow may decorate their own room', mayDecorate(user('daniel'), 'daniel'))
expect('a room-mate may decorate the shared room', mayDecorate(user('mikael'), 'kevin') && ROSTER.kevin.occupants.includes('mikael'))
expect('a fellow may not decorate a neighbour\'s room', !mayDecorate(user('daniel'), 'alison'))
expect('a room-mate\'s slug is not a room', !mayDecorate(user('mikael'), 'mikael'))
expect('an admin may decorate any room', mayDecorate(user('bart', 'admin'), 'alison'))
expect('nobody signed in may decorate nothing', !mayDecorate(null, 'daniel'))
expect('__proto__ is not a room', !mayDecorate(user('bart', 'admin'), '__proto__'))

console.log(failed ? `${failed} FAILED` : 'all passed')
process.exit(failed ? 1 : 0)
