// Generates the photographs the three videos flash: one set per act, made with
// OpenAI's image model, cropped to 16:9 and stored as greyscale JPEGs in
// stills/<act>/NN-name.jpg (committed — regenerating is not deterministic and
// costs money, roughly $0.06 a picture).
//
//   set -a; source ../../.env.local; set +a
//   node stills.mjs [act ...] [--only name,name] [--force]
//
// Existing files are kept unless --force; --only regenerates a few by name.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const dir = path.dirname(fileURLToPath(import.meta.url));
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) throw new Error('OPENAI_API_KEY missing — source ../../.env.local first');
const MODEL = process.env.STILLS_MODEL || 'gpt-image-2';

// One house style for every picture: what a projectionist at a Berlin club in
// 1995 would have shot on Tri-X. No faces that could be anyone in particular,
// no text in the picture (the videos set their own).
const STYLE = 'Black-and-white 35mm film photograph on pushed Tri-X, deep crushed blacks, hard low-key light, coarse grain, slight motion blur where something moves, documentary and austere, Berlin 1990s techno photography. No text, no letters, no logos, no watermark, no color.';

const ACTS = {
  'act-i': [ // SIGNAL — a transmission leaves a tower and crosses the city into a sleeper
    ['tower', 'A tall lattice radio mast at night in thick fog, seen from below, a single warning light at the top glowing, the steel fading up into the mist.'],
    ['lines', 'High-voltage power lines and a pylon crossing a dark empty sky, low angle, the cables thin and taut, a few birds on the wires.'],
    ['substation', 'An electrical substation at night behind a chain-link fence, wet asphalt, insulators and transformers lit by one sodium lamp, puddles reflecting the light.'],
    ['street', 'An empty city street at 3am, steam rising from a manhole cover, a single streetlight, tram tracks shining, no people.'],
    ['tunnel', 'Thick bundles of black cables running along the wall of a narrow concrete service tunnel, bare bulbs receding into darkness, vanishing point perspective.'],
    ['servers', 'A long dark corridor between server racks, tiny status lights in rows receding to a vanishing point, cold and symmetrical.'],
    ['scope', 'Macro of an old analog oscilloscope screen showing a single bright jagged waveform across the graticule, the rest of the instrument in darkness.'],
    ['window', 'A city at night seen from a high tower-block window, rows of lit windows across the dark, a blurred reflection of a lamp on the glass.'],
    ['hand', 'Close-up of a sleeping person\'s hand resting open on a white sheet in the dark, a thin strip of streetlight falling across the fingers.'],
    ['eye-closed', 'Extreme close-up of a closed human eye, eyelashes and the fine skin of the eyelid, sleeping, lit from one side, the rest black.'],
    ['eye-open', 'Extreme close-up of a wide-open human eye staring straight ahead, the pupil dilated, a single bright point of light reflected in it.'],
    ['dawn', 'The same lattice radio mast at dawn standing alone in an empty field, thin fog low on the ground, pale flat sky, very quiet.'],
  ],
  'act-ii': [ // THE FLOOR — one figure, one night, a crowd, and the floor giving way
    ['hall', 'A vast empty concrete hall of a former power station at night, enormous pillars and high windows, one small human figure standing alone in the middle of the floor, seen from far away.'],
    ['feet', 'Close-up of bare feet standing on a rough concrete floor, a crack running between them, hard light from above.'],
    ['stairs', 'A steep steel staircase inside a brutalist concrete building climbing into darkness, one caged bulb, worn steps.'],
    ['door', 'A heavy steel door in a raw concrete wall with a small square window glowing with light from the other side, night.'],
    // The night is a flood rising through the empty building — no crowd (read as
    // a football match) and no club (2026-10-08).
    ['leak', 'Water streaming down a raw concrete wall from a crack near the ceiling at night, a dark wet stain spreading, one hard light from the side, no people.'],
    ['flooded-hall', 'The vast empty concrete hall of a power station at night with a sheet of still black water covering the whole floor, the pillars and high windows reflected in it, no people.'],
    ['flooded-stairs', 'A concrete stairwell at night half underwater, the lower steps disappearing into black water, a caged bulb reflected on the surface, no people.'],
    ['crack', 'Macro of a deep crack splitting a concrete floor, dust and small fragments at its edges, raking light.'],
    ['water', 'A person floating on their back in dark still water seen from directly above, arms spread wide, calm, ripples around the body, weightless.'],
    ['birds', 'A large flock of birds wheeling against a bright white overcast sky, scattered dark shapes, seen from below.'],
    ['beam', 'A single shaft of light falling through a high window into a dark empty hall, dust particles floating in the beam.'],
    ['morning', 'The same vast concrete hall at dawn, pale light pouring through the high windows onto an empty floor, a lone figure walking away toward a bright doorway, long shadow.'],
    ['underwater', 'Looking up from under dark water toward the surface, shafts of pale light breaking through, a trail of bubbles rising, nothing else.'],
    ['condensation', 'Macro of condensation droplets gathering on a cold concrete ceiling and a steel pipe in the dark, one drop about to fall, raking light.'],
    ['ripples', 'Concentric ripples spreading across a shallow sheet of water on a concrete floor in the dark, a single light reflected and broken up in the water, no people, nobody in the frame.'],
    ['surge', 'White water surging violently through a dark concrete corridor, spray frozen mid-air by a flash, the force of a flood, no people.'],
    ['rebar', 'Broken concrete slab with twisted exposed rebar hanging over dark water, macro, raking light, drops falling from the steel.'],
  ],
  'act-iii': [ // OVERCLOCK — a machine pushed past its rating until it melts
    ['gears', 'Macro of an old clock mechanism, brass gears and a balance wheel, sharp detail, hard side light, black background.'],
    ['crystal', 'Macro of a small quartz crystal oscillator soldered onto a green circuit board, the metal can catching the light, tiny traces around it.'],
    ['die', 'Extreme macro of a bare silicon processor die, dense geometric circuitry like a city seen from the air, iridescence rendered in grey.'],
    ['fan', 'Close-up of a computer cooling fan spinning at full speed, the blades a blur, the hub sharp, dust on the frame.'],
    ['heatsink', 'Macro of aluminium heat sink fins in a tight row, hard light skimming the edges, receding into shadow.'],
    ['coil', 'A heating coil glowing intensely in total darkness, the glowing wire the only light, heat haze around it.'],
    ['moth', 'A moth resting on a bare glowing light bulb, wings translucent, the filament blazing behind it.'],
    ['foundry', 'Molten metal pouring from a crucible in a dark foundry, a bright stream and a spray of sparks, a worker\'s glove at the edge of the frame.'],
    ['thermal', 'A thermal camera image of a crowded circuit board, the hottest chips glowing white and the cool board dark, rendered in greyscale.'],
    ['smoke', 'Thin smoke curling up from a scorched circuit board in the dark, a burnt black patch around a cracked chip.'],
    ['ash', 'Ash and the last orange embers of burnt material on a dark surface, close-up, a faint curl of smoke.'],
    ['ember', 'One single tiny ember glowing in complete darkness, nothing else visible.'],
  ],
};

const argv = process.argv.slice(2);
const acts = argv.filter((a) => ACTS[a]);
const only = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
const force = argv.includes('--force');
const jobs = [];
for (const act of acts.length ? acts : Object.keys(ACTS)) {
  mkdirSync(path.join(dir, 'stills', act), { recursive: true });
  ACTS[act].forEach(([name, prompt], i) => {
    const file = path.join(dir, 'stills', act, `${String(i + 1).padStart(2, '0')}-${name}.jpg`);
    if (only && !only.includes(name)) return;
    if (existsSync(file) && !force && !only) return;
    jobs.push({ act, name, prompt, file });
  });
}

async function generate(job) {
  const t0 = Date.now();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: `${job.prompt} ${STYLE}`, size: '1536x1024', quality: process.env.STILLS_QUALITY || 'medium', n: 1 }),
    });
    const body = await res.json();
    if (res.ok && body.data?.[0]?.b64_json) {
      const raw = path.join(tmpdir(), `overclock-${job.act}-${job.name}.png`);
      writeFileSync(raw, Buffer.from(body.data[0].b64_json, 'base64'));
      // 1536×1024 → 1600 wide, centre-cropped to 16:9, greyscale.
      const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-vf', 'scale=1600:-1,crop=1600:900,format=gray', '-q:v', '3', job.file]);
      if (ff.status !== 0) throw new Error(`ffmpeg failed on ${job.name}: ${ff.stderr}`);
      console.log(`✓ ${job.act}/${path.basename(job.file)}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      return;
    }
    console.warn(`  ${job.act}/${job.name} attempt ${attempt}: ${res.status} ${JSON.stringify(body.error || body).slice(0, 200)}`);
    if (res.status < 500 && res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
  throw new Error(`could not generate ${job.act}/${job.name}`);
}

console.log(`${jobs.length} pictures with ${MODEL}`);
const queue = [...jobs];
const failures = [];
await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
  while (queue.length) { const j = queue.shift(); try { await generate(j); } catch (e) { failures.push(e.message); } }
}));
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
