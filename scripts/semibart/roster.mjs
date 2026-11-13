// Writes src/lib/semibart/roster.json: every room of the game that has someone in it, keyed the
// way the game keys it (the host's slug), with its study number, its scene and who sits there.
// The server needs it to know which rooms exist and whose they are; the game is the source, so
// rerun this after the cast, the studies or the room-mates change in public/semibart/index.html.
// Usage: node scripts/semibart/roster.mjs        (no server needed; it reads the file)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

let html = readFileSync('public/semibart/index.html', 'utf8');
// The game keeps its tables private; hand the page a copy that also shows them to this script.
if (html.includes('window.quest = {')) html = html.replace('window.quest = {', 'window.__cast = { PEOPLE, FELLOWS }; window.quest = {');

const b = await chromium.launch();
const p = await b.newPage();
await p.route('http://semibart.local/**', route => route.request().url() === 'http://semibart.local/' ? route.fulfill({ contentType: 'text/html', body: html }) : route.fulfill({ status: 404, body: '' }));
await p.goto('http://semibart.local/');
const rooms = await p.evaluate(() => {
  const cast = window.__cast || window.quest;
  if (!cast || !cast.PEOPLE) throw new Error('the page exposes no PEOPLE table');
  const { PEOPLE, FELLOWS } = cast, out = {};
  const nameOf = k => (PEOPLE[k] && PEOPLE[k].name) || (FELLOWS && FELLOWS[k] && FELLOWS[k].name) || k;
  for (const k of Object.keys(PEOPLE)) {
    const q = PEOPLE[k], occupants = [k, ...(q.mates || [])];
    out[k] = { name: q.name, study: String(q.n), scene: q.scene, occupants, names: occupants.map(nameOf) };
  }
  // Bart's study is drawn by its own branch and is not in PEOPLE.
  out.bart = { name: 'Bart', study: '16', scene: 'bart', occupants: ['bart'], names: ['Bart'] };
  return out;
});
await b.close();

const keys = Object.keys(rooms).sort();
const sorted = Object.fromEntries(keys.map(k => [k, rooms[k]]));
writeFileSync('src/lib/semibart/roster.json', JSON.stringify({ rooms: sorted }, null, 1) + '\n');
console.log(keys.length, 'rooms;', keys.reduce((n, k) => n + rooms[k].occupants.length, 0), 'occupants;', 'shared:', keys.filter(k => rooms[k].occupants.length > 1).map(k => k + '=' + rooms[k].occupants.join('+')).join(' '));
