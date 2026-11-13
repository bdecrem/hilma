// CASBS Quest's intro, act 1 in high fidelity: THIS. / CHANGES. / EVERYTHING. as real extruded,
// bevelled metal (three.js; silver, then gold) reflecting a black studio with softbox strips and a
// horizon gradient, a key light that sweeps a glint across them, bloom, an anamorphic streak, and gold
// glitter that hangs in the dark, twinkles and bursts at every hit. Each word flies in from past the
// camera and lands on its hit; the first two fly back into the dark for the pause.
// Used live by the demo page (intro.js) and frame by frame by the trailer (apps/semibart-trailer).
// createIntro3D({ E, fontUrl, width, height, pixelRatio }) → { render(t), setSize(w, h), canvas, dispose() };
// E holds the timings (HITS, WORDS, WORD_OUT, RISER, CRUMBLE). Stateless: render(t) draws time t.
// three.js comes from the page's import map (pinned, three@0.170.0).
import * as THREE from 'three';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export async function createIntro3D({ E, fontUrl, width = 1920, height = 1080, pixelRatio = 1 }) {
let W = width, H = height;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatio); renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
const pmrem = new THREE.PMREMGenerator(renderer);
// a black studio with softbox strips: what makes metal read as chrome (bands of white on black)
const studio = new THREE.Scene(); studio.background = new THREE.Color(0x000000);
const box = (w, h, x, y, z, ry, rx, c, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); studio.add(m); };
box(30, 0.8, 0, 6, 2, 0, Math.PI / 2, 0xffffff, 0.45);      // a strip overhead
box(2.2, 12, -9, 1, 4, Math.PI / 2, 0, 0xfff1dc, 3);       // warm box left
box(1.2, 12, 9, 0, 2, -Math.PI / 2, 0, 0xdce8ff, 2.5);     // cool box right
// behind the camera: the horizon the letter faces reflect, dark sky, a bright band, dark ground
{ const c = document.createElement('canvas'); c.width = 8; c.height = 512; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#000'); gr.addColorStop(0.36, '#2a2c33'); gr.addColorStop(0.47, '#ffffff'); gr.addColorStop(0.5, '#fff6e8'); gr.addColorStop(0.53, '#3a3226'); gr.addColorStop(0.75, '#0b0a08'); gr.addColorStop(1, '#000');
  x.fillStyle = gr; x.fillRect(0, 0, 8, 512); const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(2.2, 2.2, 2.2), side: THREE.DoubleSide })); m.position.set(0, 1.5, 16); m.rotation.y = Math.PI; studio.add(m); }
scene.environment = pmrem.fromScene(studio, 0.02).texture;
scene.environmentIntensity = 1.0;
const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 200);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.45, 0.4, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ---------- the words ---------- */
const ttf = await new Promise((res, rej) => new TTFLoader().load(fontUrl, res, undefined, rej));
const font = new Font(ttf);
const silver = [new THREE.MeshPhysicalMaterial({ color: 0xf0f2f6, metalness: 1, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.5, transparent: true }),
  new THREE.MeshPhysicalMaterial({ color: 0x8c909a, metalness: 1, roughness: 0.32, envMapIntensity: 1.1, transparent: true })];
const gold = [new THREE.MeshPhysicalMaterial({ color: 0xffc35a, metalness: 1, roughness: 0.09, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.7, transparent: true }),
  new THREE.MeshPhysicalMaterial({ color: 0xa8732a, metalness: 1, roughness: 0.3, envMapIntensity: 1.2, transparent: true })];
const words = E.WORDS.map((w, i) => {
  const geo = new TextGeometry(w, { font, size: 1, depth: 0.32, curveSegments: 8, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.022, bevelSegments: 4 });
  geo.computeBoundingBox(); const b = geo.boundingBox; geo.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -0.16);
  const width = b.max.x - b.min.x, height = b.max.y - b.min.y, s = Math.min(8.6 / width, 3.3 / height);
  const mesh = new THREE.Mesh(geo, i === 2 ? gold : silver); mesh.scale.setScalar(s); mesh.visible = false; scene.add(mesh);
  return { mesh, mats: i === 2 ? gold : silver };
});

/* ---------- lights ---------- */
const key = new THREE.PointLight(0xffffff, 0, 40, 1.2); scene.add(key);
const rim = new THREE.DirectionalLight(0x9fb8ff, 0.6); rim.position.set(-4, 3, -6); scene.add(rim);

/* ---------- a glow behind, and the anamorphic streak ---------- */
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const glowTex = canvasTex(512, 512, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,214,150,0.55)'); g.addColorStop(0.35, 'rgba(120,90,60,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
const glow = new THREE.Mesh(new THREE.PlaneGeometry(26, 15), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
glow.position.z = -6; scene.add(glow);
const streakTex = canvasTex(1024, 64, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(80,140,255,0)'); g.addColorStop(0.5, 'rgba(220,235,255,1)'); g.addColorStop(1, 'rgba(80,140,255,0)'); x.fillStyle = g;
  const v = x.createLinearGradient(0, 0, 0, h); x.fillRect(0, h / 2 - 3, w, 6); x.globalCompositeOperation = 'destination-in'; v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.5, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = v; x.fillRect(0, 0, w, h); });
const streak = new THREE.Sprite(new THREE.SpriteMaterial({ map: streakTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
scene.add(streak);

/* ---------- glitter ---------- */
const starTex = canvasTex(64, 64, (x, w) => { const c = w / 2, g = x.createRadialGradient(c, c, 0, c, c, c); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,240,200,0.8)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w);
  x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(c - 0.7, 2, 1.4, w - 4); x.fillRect(2, c - 0.7, w - 4, 1.4); });
function cloud(n, size) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: starTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  pts.frustumCulled = false; scene.add(pts); return pts;
}
const DUST = 2600, dust = cloud(DUST, 0.09), r0 = mulberry(11), dustSeed = Array.from({ length: DUST }, () => [r0() * 24 - 12, r0() * 14 - 7, r0() * -22 + 6, r0() * 6.28, 0.6 + r0() * 3, r0() * 0.25, r0()]);
const BURST = 700, bursts = E.HITS.map(() => cloud(BURST, 0.07)), burstSeed = E.HITS.map((_, h) => { const r = mulberry(40 + h); return Array.from({ length: BURST }, () => { const a = r() * 6.28, e = (r() - 0.5) * 2.2; return [Math.cos(a) * Math.cos(e), Math.sin(e) * 0.7, Math.sin(a) * Math.cos(e) * 0.6 + 0.4, 2 + r() * 9, 0.6 + r() * 1.6, r()]; }); });

function wordState(i, t) {
  const hit = E.HITS[i], u = t - hit, until = i < 2 ? E.WORD_OUT[i] : E.CRUMBLE[1];
  if (u < -0.32 || t >= until + 0.4) return null;
  let z, ry, op = 1;
  if (u < 0) { const k = (u + 0.32) / 0.32; z = 6.2 - 6.2 * k * k * k; ry = 0.45 * (1 - k); op = clamp(k * 3); }                 // flies in, accelerating, from past the camera
  else { z = 0.22 * Math.exp(-u * 9) * Math.cos(u * 34) + 0.12 * u; ry = 0.035 * Math.sin(u * 1.3 + i) + (i === 2 ? -0.02 * u : 0.015 * u); }
  if (t > until) { const k = (t - until) / 0.4; z -= 26 * k * k; op = 1 - k; }                                // flies back into the dark
  return { z, ry, op, u };
}

function render(t) {
  // camera: a slow push, shaken by every hit and by the riser
  const rs = mulberry(Math.floor(t * 30) * 13 + 1);
  let shake = 0; E.HITS.forEach(h => { if (t >= h) shake += 0.22 * Math.exp(-(t - h) * 7); });
  const rise = Math.pow(clamp((t - E.RISER[0]) / (E.RISER[1] - E.RISER[0])), 2); shake += rise * 0.07;
  camera.position.set((rs() - 0.5) * shake, (rs() - 0.5) * shake, (10.6 - t * 0.09) * Math.max(1, (16 / 9) / (W / H)));   // narrower screens stand further back
  camera.lookAt(0, 0, 0); camera.rotation.z += (rs() - 0.5) * shake * 0.05;

  let flash = 0, live = -1;
  words.forEach((w, i) => {
    const s = wordState(i, t); w.mesh.visible = !!s; if (!s) return;
    if (s.u >= 0) live = i;
    w.mesh.position.z = s.z; w.mesh.rotation.y = s.ry; w.mesh.rotation.x = 0.03 * Math.sin(t * 0.7 + i);
    w.mats.forEach(m => { m.opacity = s.op; });
    if (s.u >= 0) flash = Math.max(flash, Math.exp(-s.u * 13));
  });
  // the key light sweeps a glint across the live word, faster as the riser climbs
  const since = live >= 0 ? t - E.HITS[live] : 0, sweep = live >= 0 ? ((since * (0.42 + rise * 1.6)) % 1.4) / 1.4 : 0;
  key.position.set(-8 + 16 * sweep, 2.2, 6.5); key.intensity = live >= 0 ? 14 + 40 * flash : 0;
  renderer.toneMappingExposure = 1.1 + 0.45 * flash + rise * 0.2;
  bloom.strength = 0.4 + 0.6 * flash + rise * 0.45;
  glow.material.opacity = live >= 0 ? 0.35 + 0.5 * flash + rise * 0.35 : 0.1;
  // the streak rides the glint across the letters
  const sx = -4.3 + 8.6 * sweep; streak.position.set(sx, 0.35, 1.2); streak.scale.set(16 + 10 * flash, 0.55, 1);
  streak.material.opacity = live >= 0 ? clamp(0.35 + 1.2 * flash + 0.5 * Math.pow(Math.sin(sweep * Math.PI), 6)) : 0;

  // glitter in the air: drifting, twinkling, swirling faster in the riser
  const dp = dust.geometry.attributes.position.array, dc = dust.geometry.attributes.color.array;
  dustSeed.forEach(([x, y, z, ph, f, v, w], k) => {
    const sw = rise * 2.4 * t, a = sw * (0.2 + w * 0.3);
    const X = x * Math.cos(a) - z * 0.1 * Math.sin(a), Y = y + Math.sin(t * 0.4 + ph) * 0.3 - v * t;
    dp[k * 3] = X; dp[k * 3 + 1] = Y; dp[k * 3 + 2] = z;
    const tw = Math.pow(0.5 + 0.5 * Math.sin(t * f * 2.2 + ph), 8) * (0.5 + flash * 1.5 + rise), gw = w > 0.82 ? [0.75, 0.85, 1] : [1, 0.8, 0.45];
    dc[k * 3] = gw[0] * tw; dc[k * 3 + 1] = gw[1] * tw; dc[k * 3 + 2] = gw[2] * tw;
  });
  dust.geometry.attributes.position.needsUpdate = true; dust.geometry.attributes.color.needsUpdate = true;
  // a burst of gold from every hit
  bursts.forEach((b, h) => {
    const u = t - E.HITS[h], p = b.geometry.attributes.position.array, c = b.geometry.attributes.color.array; b.visible = u >= 0 && u < 2.6;
    if (!b.visible) return;
    burstSeed[h].forEach(([dx, dy, dz, sp, life, ph], k) => {
      const d = sp * (1 - Math.exp(-u * 2.6)), fade = clamp(1 - u / life);
      p[k * 3] = dx * d; p[k * 3 + 1] = dy * d - 0.35 * u * u; p[k * 3 + 2] = dz * d * 0.5 + 0.4;
      const tw = fade * fade * (0.6 + 0.4 * Math.sin(u * 30 + ph * 20)) * 1.6;
      c[k * 3] = tw; c[k * 3 + 1] = tw * 0.82; c[k * 3 + 2] = tw * 0.5;
    });
    b.geometry.attributes.position.needsUpdate = true; b.geometry.attributes.color.needsUpdate = true;
  });
  composer.render();
  return renderer.domElement;
}
function setSize(w, h) { W = w; H = h; renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
return { render, setSize, canvas: renderer.domElement, dispose() { renderer.dispose(); renderer.forceContextLoss(); } };
}
