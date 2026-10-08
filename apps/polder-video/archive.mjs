// The footage comes from movingimagearchive.com — public-domain films from the
// Internet Archive's collections, cut into shots and captioned, with a semantic
// search ("describe a shot") and a direct mp4 per shot.
//
//   node archive.mjs search "waves breaking on a sea wall" [--bw] [--max-year 1979] [--out name]
//       → search/<name>.json (the clips) and search/<name>.jpg (a numbered contact sheet of thumbnails)
//   node archive.mjs fetch                     → downloads every clip in clips.json to footage/<name>.mp4
//                                                and extracts frames: footage/<name>/0001.jpg … (960 wide, greyscale, FPS a second)
//   node archive.mjs probe <clip id | url>     → resolution, fps, duration (ffprobe over http, no download)
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'https://www.movingimagearchive.com';
const UA = 'Mozilla/5.0 (Macintosh) hilma/polder-video';
export const FPS = 25;

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(k);

export async function search(query, { bw = false, yearMin, yearMax, offset = 0 } = {}) {
  const body = { query, color: bw ? 'bw' : 'all', aspectRatio: 'all', offset, ...(yearMin ? { yearMin } : {}), ...(yearMax ? { yearMax } : {}) };
  const res = await fetch(`${BASE}/api/search`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`search ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export function probe(url) {
  const p = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_frames:format=duration', '-of', 'json', url], { encoding: 'utf8' });
  if (p.status !== 0) throw new Error(`ffprobe ${url}: ${p.stderr.slice(-300)}`);
  const j = JSON.parse(p.stdout), s = j.streams[0];
  const [a, b] = s.avg_frame_rate.split('/').map(Number);
  return { width: s.width, height: s.height, fps: +(a / b).toFixed(2), duration: +Number(j.format.duration).toFixed(2) };
}

async function sheet(name, clips) {
  // A numbered contact sheet of the thumbnails, 6 across.
  const tmp = path.join(dir, 'search', `.thumbs-${name}`); mkdirSync(tmp, { recursive: true });
  await Promise.all(clips.map(async (c, i) => {
    const f = path.join(tmp, `${i}.jpg`); if (existsSync(f)) return;
    const res = await fetch(c.thumbnailUrl, { headers: { 'User-Agent': UA } });
    if (res.ok) writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }));
  const py = `
from PIL import Image, ImageDraw, ImageFont
import json, os
clips = json.load(open(${JSON.stringify(path.join(dir, 'search', `${name}.json`))}))['clips'][:${clips.length}]
cols, cw, ch = 6, 320, 200
rows = (len(clips) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cw, rows * ch), 'black')
d = ImageDraw.Draw(sheet)
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 22)
small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 13)
for i, c in enumerate(clips):
    x, y = (i % cols) * cw, (i // cols) * ch
    f = os.path.join(${JSON.stringify(tmp)}, f'{i}.jpg')
    if os.path.exists(f):
        im = Image.open(f).convert('L').convert('RGB'); im.thumbnail((cw - 4, ch - 34)); sheet.paste(im, (x + 2, y + 2))
    d.rectangle([x, y + ch - 32, x + cw, y + ch], fill='black')
    d.text((x + 6, y + ch - 31), f'{i}', fill='yellow', font=font)
    d.text((x + 40, y + ch - 28), f"{c.get('sourceYear') or '?'} · {c['durationSeconds']:.0f}s · {c['sourceTitle'][:32]}", fill='white', font=small)
sheet.save(${JSON.stringify(path.join(dir, 'search', `${name}.jpg`))}, quality=80)
print('sheet', ${JSON.stringify(name)}, len(clips), 'clips', '')
`;
  const p = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  if (p.status !== 0) throw new Error(p.stderr);
  process.stdout.write(p.stdout);
}

if (cmd === 'search') {
  const query = argv[1]; if (!query) throw new Error('search needs a query');
  const name = opt('--out', query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48));
  mkdirSync(path.join(dir, 'search'), { recursive: true });
  const r = await search(query, { bw: flag('--bw'), yearMin: Number(opt('--min-year', 0)) || undefined, yearMax: Number(opt('--max-year', 0)) || undefined, offset: Number(opt('--offset', 0)) });
  const clips = r.clips.slice(0, Number(opt('--n', 30)));
  writeFileSync(path.join(dir, 'search', `${name}.json`), JSON.stringify({ query, clips: r.clips }, null, 1));
  await sheet(name, clips);
} else if (cmd === 'probe') {
  const x = argv[1];
  const url = x.startsWith('http') ? x : `${BASE}/api/clips/${x}/download`;
  console.log(JSON.stringify(probe(url)));
} else if (cmd === 'fetch') {
  const clips = JSON.parse(readFileSync(path.join(dir, 'clips.json'), 'utf8'));
  mkdirSync(path.join(dir, 'footage'), { recursive: true });
  const manifest = {};
  for (const [name, c] of Object.entries(clips)) {
    const mp4 = path.join(dir, 'footage', `${name}.mp4`), frames = path.join(dir, 'footage', name);
    if (!existsSync(mp4)) {
      let res;
      for (let attempt = 1; ; attempt++) {
        res = await fetch(c.url || `${BASE}/api/clips/${c.id}/download`, { headers: { 'User-Agent': UA }, redirect: 'follow' });
        if (res.ok) break;
        if ((res.status === 429 || res.status >= 500) && attempt < 6) { await new Promise((r) => setTimeout(r, 4000 * attempt)); continue; }
        throw new Error(`${name}: ${res.status}`);
      }
      writeFileSync(mp4, Buffer.from(await res.arrayBuffer()));
      await new Promise((r) => setTimeout(r, 600));
    }
    if (!existsSync(frames) || readdirSync(frames).length === 0) {
      mkdirSync(frames, { recursive: true });
      // 960 wide, greyscale, FPS frames a second, from c.in to c.out (seconds into the shot) when given.
      const args = ['-v', 'error', '-y'];
      if (c.in) args.push('-ss', String(c.in));
      args.push('-i', mp4);
      if (c.out) args.push('-t', String(c.out - (c.in || 0)));
      args.push('-vf', `fps=${FPS},scale=960:-2:flags=lanczos,format=gray`, '-q:v', '4', path.join(frames, '%04d.jpg'));
      const p = spawnSync('ffmpeg', args, { encoding: 'utf8' });
      if (p.status !== 0) throw new Error(`${name}: ${p.stderr.slice(-300)}`);
    }
    const n = readdirSync(frames).filter((f) => f.endsWith('.jpg')).length;
    const pr = probe(mp4);
    console.log(`${name.padEnd(16)} ${pr.width}×${pr.height} ${pr.fps} fps ${pr.duration}s → ${n} frames`);
    manifest[name] = { frames: n, width: pr.width, height: pr.height, id: c.id, source: c.source, title: c.title, year: c.year };
  }
  writeFileSync(path.join(dir, 'footage', 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`manifest: ${Object.keys(manifest).length} clips`);
} else if (cmd === 'source') {
  // Every shot of one source film, from its page (the search is per shot; a film's other shots are often better).
  const slug = argv[1];
  const html = await (await fetch(`${BASE}/sources/${slug}`, { headers: { 'User-Agent': UA } })).text();
  const payload = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map((m) => JSON.parse(`"${m[1]}"`)).join('');
  const i = payload.indexOf('"clips":['); if (i < 0) throw new Error(`no clips in ${slug}`);
  let depth = 0, j = i + 8; for (; j < payload.length; j++) { if (payload[j] === '[') depth++; else if (payload[j] === ']' && --depth === 0) break; }
  const clips = JSON.parse(payload.slice(i + 8, j + 1));
  const syn = payload.match(/"synopsis":"((?:[^"\\]|\\.)*)"/);
  mkdirSync(path.join(dir, 'search'), { recursive: true });
  const name = `src-${slug.slice(0, 40)}`;
  writeFileSync(path.join(dir, 'search', `${name}.json`), JSON.stringify({ query: `source ${slug}`, synopsis: syn ? JSON.parse(`"${syn[1]}"`) : '', clips }, null, 1));
  console.log(`${slug}: ${clips.length} shots` + (syn ? ` — ${JSON.parse(`"${syn[1]}"`).slice(0, 300)}` : ''));
  await sheet(name, clips.slice(0, Number(opt('--n', 48))));
} else {
  console.log('usage: node archive.mjs search "…" | fetch | probe <id>');
}
