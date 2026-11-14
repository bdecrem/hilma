// The check every piece of room code passes before it is saved (and so before anyone's
// browser runs it): a scan for things room code has no business naming, then a dry run of
// two minutes of frames in an empty V8 context with a stand-in for the drawing helpers.
// It catches code that does not compile, throws, never finishes, draws nothing, draws far
// too much, or passes junk to the helpers. No Next imports; node:vm only.

import vm from 'node:vm'

export const ROOM_W = 320
export const ROOM_H = 144
export const MAX_CODE = 24_000
/** fillRect calls a single frame may make, all layers together. */
export const MAX_OPS = 9000

export type RoomSpot = { name: string; r: [number, number, number, number]; look: string }

export type RoomCheck =
  | { ok: true; layers: string[]; hide: string[]; maxOps: number; painted: number; spots: number }
  | { ok: false; error: string }

// Names that only make sense for code trying to leave the room. The browser also shadows
// every global and removes the Function constructors, so this list is the first fence, not
// the only one.
const BANNED = /\b(import|constructor|prototype|__proto__|eval|Function|async|await|debugger|globalThis|window|document|fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|quest|questRooms)\b/

/** The code with string contents and comments blanked, so a look line may say "by the window". */
function bareCode(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; out += ' '; continue }
    if (c === '"' || c === "'" || c === '`') {
      i++
      while (i < src.length && src[i] !== c) { if (src[i] === '\\') i++; i++ }
      i++
      out += c + c
      continue
    }
    out += c
    i++
  }
  return out
}

export function scanRoomCode(code: string): string | null {
  if (code.length > MAX_CODE) return `the code is ${code.length} characters; the limit is ${MAX_CODE}`
  if (/\\u|\\x/.test(code)) return 'escape sequences (\\u, \\x) are not allowed; write the character itself'
  const m = BANNED.exec(bareCode(code))
  if (m) return `room code may not use the name "${m[1]}" (pick another name if it is one of your own variables)`
  return null
}

// Runs inside the context. `__CODE__` is replaced by the room code, as the body of a function.
const HARNESS = `(function () {
  'use strict';
  var W = ${ROOM_W}, H = ${ROOM_H}, ops = 0, painted = 0, bad = '';
  function note(s) { if (!bad) bad = s; }
  function num(v) { return typeof v === 'number' && v === v && v !== Infinity && v !== -Infinity; }
  function fill(x, y, w, h, col) {
    ops++;
    if (typeof col !== 'string' || !col) return note('a drawing call got a colour that is not a string: ' + String(col));
    if (!num(x) || !num(y) || !num(w) || !num(h)) return note('a drawing call got a coordinate that is not a number');
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    var x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
    if (x1 > x0 && y1 > y0) painted += (x1 - x0) * (y1 - y0);
  }
  var you = { x: 120, y: 134, face: 1, moving: false };
  var api = {
    W: W, H: H, calm: false, you: you,
    rect: fill,
    px: function (x, y, col) { fill(x, y, 1, 1, col); },
    disc: function (cx, cy, r, col) { if (!num(r) || r < 0 || r > 200) return note('disc radius out of range'); for (var j = -r; j <= r; j++) { var w = Math.floor(Math.sqrt(r * r - j * j) + 0.5); fill(cx - w, cy + j, w * 2 + 1, 1, col); } },
    oval: function (cx, cy, rx, ry, col) { if (!num(rx) || !num(ry) || rx < 0 || ry < 0 || rx > 320 || ry > 200) return note('oval radius out of range'); if (ry < 1) return fill(cx - rx, cy, rx * 2 + 1, 1, col); for (var j = -ry; j <= ry; j++) { var w = Math.floor(rx * Math.sqrt(1 - (j * j) / (ry * ry)) + 0.5); fill(cx - w, cy + j, w * 2 + 1, 1, col); } },
    dither: function (x, y, w, h, a, b) { if (!num(w) || !num(h) || w < 0 || h < 0 || w * h > 20000) return note('dither area out of range'); fill(x, y, w, h, a); fill(x, y, w, h, b); ops += Math.ceil(w * h / 2); },
    sprite: function (rows, pal, x, y) {
      if (!Array.isArray(rows) || !pal || typeof pal !== 'object') return note('sprite needs an array of row strings and a palette object');
      if (rows.length > 160) return note('a sprite is at most 160 rows tall');
      for (var j = 0; j < rows.length; j++) {
        var row = rows[j]; if (typeof row !== 'string') return note('sprite rows must be strings');
        if (row.length > 320) return note('a sprite row is at most 320 wide');
        for (var i = 0; i < row.length; i++) { var c = pal[row[i]]; if (c) fill(x + i, y + j, 1, 1, c); }
      }
    },
    text: function (cx, y, s, col) { if (typeof s !== 'string' && typeof s !== 'number') return note('text needs a string'); s = String(s); if (s.length > 60) return note('text is at most 60 characters'); fill(cx - s.length * 2, y, s.length * 4 - 1, 5, col); ops += s.length * 8; },
    rng: function (seed) { var s = seed >>> 0; return function () { return ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }; },
    wall: function (x, y, w, h) { fill(x, y, w, h, '#9a5631'); ops += 8; },
    floor: function (x, y, w, h) { fill(x, y, w, h, '#c9a77a'); ops += 4; },
    person: function (x, y, opts) {
      if (opts !== undefined && (opts === null || typeof opts !== 'object')) return note('person options must be an object');
      if (opts && opts.who !== undefined && !(opts.who === 0 || opts.who === 1 || opts.who === 2)) return note('person who must be 0, 1 or 2');
      fill(x + 2, y, 24, 31, '#e8b08f'); ops += 260; persons++;
    }
  };
  var persons = 0, HIDEABLE = ['occupant', 'mates', 'desk', 'chair', 'extras', 'bookshelf', 'rug', 'board', 'window'];
  function spotsOf(mod, t) {
    var list = typeof mod.spots === 'function' ? mod.spots(t) : mod.spots;
    if (list === undefined || list === null) return 0;
    if (!Array.isArray(list)) throw new Error('spots must be an array, or a function that returns one');
    if (list.length > 12) throw new Error('at most 12 spots');
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s || typeof s.name !== 'string' || !s.name || s.name.length > 40) throw new Error('every spot needs a name of 1 to 40 characters');
      if (typeof s.look !== 'string' || !s.look || s.look.length > 220) throw new Error('every spot needs a look line of 1 to 220 characters');
      if (!Array.isArray(s.r) || s.r.length !== 4 || !s.r.every(num)) throw new Error('every spot needs r: [x, y, w, h] in numbers');
      if (s.r[2] < 3 || s.r[3] < 3) throw new Error('a spot is at least 3 by 3');
    }
    return list.length;
  }
  var out = { ok: false, error: '', layers: [], hide: [], maxOps: 0, painted: 0, spots: 0, persons: 0 };
  try {
    var SAFE = { keys: Object.keys, values: Object.values, entries: Object.entries, assign: Object.assign, freeze: Object.freeze, fromEntries: Object.fromEntries };
    var mod = (function (Object, console) {
__CODE__
    }).call(undefined, SAFE, undefined);
    if (mod === undefined || mod === null) mod = {};
    if (typeof mod !== 'object') throw new Error('the code must return an object: { back, mid, front, spots }');
    var LAYERS = ['back', 'mid', 'front'];
    for (var k in mod) if (LAYERS.indexOf(k) < 0 && k !== 'spots' && k !== 'hide' && k !== 'seats') throw new Error('unknown key "' + k + '" in the returned object; use back, mid, front, spots, hide, seats');
    if (mod.seats !== undefined) {
      if (!mod.seats || typeof mod.seats !== 'object' || Array.isArray(mod.seats)) throw new Error('seats must be an object like { 1: [centre x, desk width] }');
      for (var sk in mod.seats) {
        var sv = mod.seats[sk];
        if (sk !== '0' && sk !== '1' && sk !== '2') throw new Error('seats: "' + sk + '" is not an occupant number (0 to 2)');
        if (!Array.isArray(sv) || !num(sv[0]) || !num(sv[1]) || sv[1] < 30 || sv[1] > 120 || sv[0] - sv[1] / 2 < 40 || sv[0] + sv[1] / 2 > 319) throw new Error('seats: each is [centre x, desk width], the width 30 to 120 and the whole desk inside x 40-319');
      }
    }
    if (mod.hide !== undefined) {
      if (!Array.isArray(mod.hide)) throw new Error('hide must be an array of names');
      if (mod.hide.length > 16) throw new Error('hide lists at most 16 names');
      for (var hi = 0; hi < mod.hide.length; hi++) { var hn = mod.hide[hi]; if (typeof hn !== 'string' || (HIDEABLE.indexOf(hn) < 0 && !/^(person|desk|chair):[0-2]$/.test(hn))) throw new Error('hide: "' + String(hn) + '" is not one of ' + HIDEABLE.join(', ') + ', or person:N / desk:N / chair:N with N from 0 to 2'); }
      out.hide = mod.hide.slice();
    }
    LAYERS.forEach(function (l) { if (mod[l] !== undefined) { if (typeof mod[l] !== 'function') throw new Error(l + ' must be a function (api, t)'); out.layers.push(l); } });
    var times = [];
    for (var i = 0; i < 480; i++) times.push(i * 0.25 + (i % 7) * 0.013);
    times.push(600.4, 3600.9, 14400.2);
    for (var f = 0; f < times.length; f++) {
      var t = times[f];
      you.x = 40 + ((f * 37) % 260); you.y = 126 + ((f * 5) % 16); you.face = f % 2 ? 1 : -1; you.moving = f % 3 === 0;
      api.calm = f % 97 === 96;
      ops = 0;
      for (var li = 0; li < out.layers.length; li++) mod[out.layers[li]](api, t);
      out.spots = Math.max(out.spots, spotsOf(mod, t));
      if (ops > out.maxOps) out.maxOps = ops;
      if (ops > ${MAX_OPS}) throw new Error('one frame made ' + ops + ' drawing calls at t=' + t.toFixed(1) + '; the limit is ${MAX_OPS}. Draw with fewer, larger rects, or pre-compute.');
      if (bad) throw new Error(bad + ' (at t=' + t.toFixed(1) + ')');
    }
    out.painted = painted;
    out.persons = persons;
    out.ok = true;
  } catch (e) {
    out.error = String(e && e.message ? e.message : e).slice(0, 400);
  }
  return JSON.stringify(out);
})()`

/** Compile and dry-run room code. Never throws: a failure comes back as { ok: false }. */
export function checkRoomCode(code: string): RoomCheck {
  const scan = scanRoomCode(code)
  if (scan) return { ok: false, error: scan }
  let raw: unknown
  try {
    // An empty context: no process, no require, no timers; and no code from strings, which
    // closes the Function-constructor door from inside.
    const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } })
    const script = new vm.Script(HARNESS.replace('__CODE__', () => code), { filename: 'room.js' })
    raw = script.runInContext(context, { timeout: 2500 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/timed out/i.test(msg)) return { ok: false, error: 'the code did not finish: two minutes of frames must run in a couple of seconds (an endless loop, or far too much work per frame)' }
    return { ok: false, error: `the code does not compile: ${msg}`.slice(0, 400) }
  }
  if (typeof raw !== 'string') return { ok: false, error: 'the check returned nothing' }
  const out = JSON.parse(raw) as { ok: boolean; error: string; layers: string[]; hide: string[]; maxOps: number; painted: number; spots: number; persons: number }
  if (!out.ok) return { ok: false, error: out.error || 'the code failed' }
  if (out.layers.length && out.painted === 0) return { ok: false, error: 'nothing was drawn inside the room (320 by 144) in two minutes of frames' }
  return { ok: true, layers: out.layers, hide: out.hide, maxOps: out.maxOps, painted: out.painted, spots: out.spots }
}
