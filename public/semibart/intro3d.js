// CASBS Quest's intro, act 1 in high fidelity: THIS. / CHANGES. / EVERYTHING. as extruded, bevelled
// metal (three.js) slammed onto a black mirror floor, one colour to a word: cold steel under an
// ultramarine light, then the word CHANGES. is changed, a white-hot line crossing it and leaving it
// red-hot copper, then gold. Behind each word a light comes on at the hit and shines through the gaps
// between the letters (real light shafts: an occlusion pass smeared away from the light), with a lens
// streak and ghosts that dim when a letter passes in front of it. The camera is low and never still:
// it drifts around each word and swings to the other side in the dark between them. Sparks leave the
// floor at every hit, a ring runs out across it, haze hangs in the light, and in the riser gold
// glitter pours upward until the frame freezes for the crumble.
// Used live by the demo page (intro.js) and frame by frame by the trailer (apps/semibart-trailer).
// createIntro3D({ E, fontUrl, width, height, pixelRatio }) → { render(t, ambient), setSize(w, h, pixelRatio), canvas, dispose() };
// E holds the timings (HITS, WORDS, WORD_OUT, RISER, CRUMBLE, and HEAT for the hot line). Stateless: render(t) draws time t.
// `ambient` is the clock of what only drifts (dust, haze); it defaults to t, and the demo page keeps
// it running under the prompt so the dark is alive before the click (render(-1, seconds)).
// Look at it with: node scripts/semibart/intro-shots.mjs <dir> [--times …] [--perf]
// three.js comes from the page's import map (pinned, three@0.170.0).
import * as THREE from 'three';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { TexturePass } from 'three/addons/postprocessing/TexturePass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;

const FLY = 0.42;                 // a word is in the air this long before its hit
const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

// light shafts: the occlusion picture (the light, with the letters black in front of it) smeared away from the light
const RAYS_FS = `
uniform sampler2D tOcc; uniform vec2 light; uniform float time; uniform float aspect; varying vec2 vUv;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
  vec2 d = vUv - light, st = d * (0.94 / 44.0);
  vec2 uv = vUv - st * hash(gl_FragCoord.xy + 97.0 * fract(time * vec2(7.13, 3.71)));
  float illum = 1.0, acc = 0.0;
  for (int i = 0; i < 44; i++) { uv -= st; acc += texture2D(tOcc, uv).r * illum; illum *= 0.958; }
  float ang = atan(d.y, d.x * aspect);
  float shaft = 0.72 + 0.28 * sin(ang * 19.0 + time * 0.5) * sin(ang * 7.0 - time * 0.31);
  gl_FragColor = vec4(vec3(acc * shaft / 44.0), 1.0);
}`;

// the lens: colour fringes toward the edges, the shafts, a streak and ghosts from the light, a vignette,
// then film: a filmic curve, a little more colour, grain
const LENS_FS = `
uniform sampler2D tDiffuse; uniform sampler2D tRays; uniform sampler2D tOcc;
uniform vec2 light; uniform vec3 hue; uniform vec3 core; uniform float rays; uniform float flare; uniform float ca;
uniform float exposure; uniform float time; uniform float aspect; uniform float grain;
varying vec2 vUv;
float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec3 film(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 c = vUv - 0.5; float r2 = dot(c, c);
  vec2 off = c * ca * (0.3 + 2.8 * r2);
  vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
  float ry = texture2D(tRays, vUv).r, ryR = texture2D(tRays, vUv + off * 2.0).r, ryB = texture2D(tRays, vUv - off * 2.0).r;
  col += (hue * vec3(ryR, ry, ryB) + core * ry * ry * 1.6) * rays;
  // how much of the light is in the clear right now
  float vis = 0.0;
  for (int i = 0; i < 8; i++) { float a = float(i) * 0.7854; vis += texture2D(tOcc, light + vec2(cos(a), sin(a) * aspect) * 0.012).r; }
  vis = clamp(vis / 8.0 * 1.4 + texture2D(tOcc, light).r * 0.4, 0.0, 1.0);
  vec2 dl = vUv - light; dl.x *= aspect;
  float streak = exp(-abs(dl.y) * 150.0) / (1.0 + dl.x * dl.x * 2.2) + 0.35 * exp(-abs(dl.y) * 36.0) / (1.0 + dl.x * dl.x * 9.0);
  col += mix(hue, core, 0.35) * streak * flare * vis * 1.5;
  vec2 lc = light - 0.5;
  for (int i = 0; i < 4; i++) {
    float k = i == 0 ? -0.42 : i == 1 ? -0.95 : i == 2 ? 0.38 : -1.55, sz = i == 0 ? 0.045 : i == 1 ? 0.11 : i == 2 ? 0.022 : 0.2;
    vec2 g = (vUv - (0.5 + lc * k)) * vec2(aspect, 1.0); float dd = length(g) / sz;
    col += hue * (smoothstep(1.0, 0.82, dd) * (0.35 + 0.65 * smoothstep(0.55, 1.0, dd))) * flare * vis * (i == 3 ? 0.035 : 0.09);
  }
  col *= 1.0 - 1.05 * r2;
  col *= exposure;
  col = film(col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, 1.16);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hash(gl_FragCoord.xy + 113.0 * fract(time * vec2(5.31, 9.17))) - 0.5) * grain;
}`;

// the floor: a black mirror that is not quite clean. The reflection smears downward, grows with the
// angle, fades toward the camera and into the dark; light pools under the sun, and the shock ring runs out.
const FLOOR_VS = 'uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW; void main() { vUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const FLOOR_FS = `
uniform vec3 color; uniform sampler2D tDiffuse; uniform sampler2D tNoise; uniform vec3 bg; uniform vec3 sunCol; uniform vec3 sunPos; uniform vec3 ring; uniform vec3 ringCol; uniform float amount; uniform vec2 fade;
varying vec4 vUv; varying vec3 vW;
void main() {
  vec3 toCam = cameraPosition - vW; float dist = length(toCam); vec3 V = toCam / dist;
  vec4 n = texture2D(tNoise, vW.xz * 0.21);
  float fres = 0.2 + 0.8 * pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
  vec4 uv = vUv; uv.x += (n.r - 0.5) * 0.012 * uv.w;
  vec3 refl = vec3(0.0); float wsum = 0.0; vec3 hq = fract(vec3(gl_FragCoord.xyx) * 0.1031); hq += dot(hq, hq.yzx + 33.33); float jit = fract((hq.x + hq.y) * hq.z);
  float smear = (0.0035 + 0.011 * n.g) * (0.35 + 0.16 * max(vW.z, 0.0));
  for (int i = 0; i < 7; i++) { float k = (float(i) + jit) / 7.0 - 0.3, w = 1.0 - abs(k - 0.2) * 0.9; vec4 u2 = uv; u2.y += k * smear * uv.w; refl += texture2DProj(tDiffuse, u2).rgb * w; wsum += w; }
  refl /= wsum; refl *= exp(-max(vW.z - 0.25, 0.0) * 0.2);
  float gloss = 0.62 + 0.55 * texture2D(tNoise, vW.xz * 0.045 + 0.31).b;
  vec3 col = refl * fres * gloss * amount * color;
  vec2 ds = vW.xz - sunPos.xz; col += sunCol * (0.012 * exp(-dot(ds, ds) * 0.012) + 0.02 * exp(-dot(ds, ds) * 0.12)) * (0.6 + 0.8 * n.b);
  float r = length(vW.xz), rw = (r - ring.x) / ring.y; col += ringCol * ring.z * exp(-rw * rw) * (0.7 + 0.6 * n.g);
  col = mix(col, bg, smoothstep(fade.x, fade.y, dist));
  gl_FragColor = vec4(col, 1.0);
}`;

export async function createIntro3D({ E, fontUrl, width = 1920, height = 1080, pixelRatio = 1, tune = {} }) {
let W = width, H = height;
const HEAT = E.HEAT || [0.3, 0.85];   // CHANGES.: the hot line starts this long after the hit and takes this long to cross
const T = { env: 1, sun: 1, rays: 1, flare: 1, haze: 1, bloom: 1, dust: 1, floor: 1, msaa: 4, floorRes: 0.6, ...tune };    // for looking at one layer at a time (intro-shots.mjs --tune)
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatio); renderer.setSize(W, H, false);
renderer.toneMapping = THREE.NoToneMapping;      // the lens pass has its own film curve
renderer.localClippingEnabled = true;            // CHANGES. is two metals with a plane between them
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 15, 40);
const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 200);
const C = h => new THREE.Color(h);
// one look to a word: the light, its white-hot centre, the dark behind it, the sparks
const LOOK = [
  { hue: C(0x2f5cff), core: C(0xc4d6ff), bg: C(0x010309), spark: C(0x9dbcff) },
  { hue: C(0xff4310), core: C(0xffc48a), bg: C(0x090201), spark: C(0xff8a3a) },
  { hue: C(0xff8a14), core: C(0xffe9b4), bg: C(0x070301), spark: C(0xffc45a) },
];

/* ---------- textures ---------- */
function canvasTex(w, h, draw, data) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace; if (data) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
// brushed: long horizontal hairlines, a few duller patches (green is the roughness)
const roughTex = canvasTex(512, 512, (x, w, h) => { const r = mulberry(3); x.fillStyle = 'rgb(140,140,140)'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { const v = 70 + r() * 185 | 0, X = r() * w, Y = r() * h | 0, L = 30 + r() * 240; x.fillStyle = `rgba(${v},${v},${v},${0.1 + r() * 0.3})`; x.fillRect(X, Y, L, 1); x.fillRect(X - w, Y, L, 1); }
  for (let i = 0; i < 40; i++) { const X = r() * w, Y = r() * h, R = 20 + r() * 70, g = x.createRadialGradient(X, Y, 0, X, Y, R), v = r() < 0.5 ? 235 : 60; g.addColorStop(0, `rgba(${v},${v},${v},0.3)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); x.fillStyle = g; x.fillRect(X - R, Y - R, R * 2, R * 2); } }, true);
// not quite flat: a tileable swell, so a reflection bends as it crosses a letter
const normalTex = (() => { const N = 256, d = new Uint8Array(N * N * 4), r = mulberry(9), terms = Array.from({ length: 6 }, () => [1 + (r() * 2 | 0), (r() * 3 | 0) * (r() < 0.5 ? -1 : 1), r() * 6.28, 0.4 + r()]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let gx = 0, gy = 0; for (const [kx, ky, ph, a] of terms) { const c = a * Math.cos(6.2832 * (kx * x / N + ky * y / N) + ph); gx += c * kx; gy += c * ky; }
    const nx = -gx * 0.06, ny = -gy * 0.06, l = Math.hypot(nx, ny, 1), o = (y * N + x) * 4; d[o] = (nx / l * 0.5 + 0.5) * 255; d[o + 1] = (ny / l * 0.5 + 0.5) * 255; d[o + 2] = (1 / l * 0.5 + 0.5) * 255; d[o + 3] = 255; }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t; })();
// what is still glowing in the copper after the line has passed
const heatTex = canvasTex(256, 256, (x, w, h) => { const r = mulberry(21); x.fillStyle = '#3a0c02'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) { const X = r() * w, Y = r() * h, R = 8 + r() * 46, g = x.createRadialGradient(X, Y, 0, X, Y, R), hot = r() < 0.35; g.addColorStop(0, hot ? 'rgba(255,190,90,0.75)' : 'rgba(255,70,10,0.5)'); g.addColorStop(1, 'rgba(255,60,0,0)');
    x.fillStyle = g; for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) x.fillRect(X - R + ox, Y - R + oy, R * 2, R * 2); } });
heatTex.wrapS = heatTex.wrapT = THREE.RepeatWrapping;
const floorTex = canvasTex(256, 256, (x, w, h) => { const r = mulberry(17); x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { const X = r() * w, Y = r() * h, R = 6 + r() * 44, g = x.createRadialGradient(X, Y, 0, X, Y, R), c = [r() * 255 | 0, r() * 255 | 0, r() * 255 | 0]; g.addColorStop(0, `rgba(${c},0.5)`); g.addColorStop(1, `rgba(${c},0)`);
    x.fillStyle = g; for (const ox of [0, -w, w]) for (const oy of [0, -h, h]) x.fillRect(X - R + ox, Y - R + oy, R * 2, R * 2); } }, true);
const softTex = canvasTex(256, 256, (x, w) => { const c = w / 2, g = x.createRadialGradient(c, c, 0, c, c, c); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.07, 'rgba(255,255,255,0.8)'); g.addColorStop(0.22, 'rgba(255,255,255,0.24)'); g.addColorStop(0.5, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
const occTex = canvasTex(256, 256, (x, w) => { const c = w / 2, g = x.createRadialGradient(c, c, 0, c, c, c); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.14, 'rgba(255,255,255,0.9)'); g.addColorStop(0.3, 'rgba(255,255,255,0.3)'); g.addColorStop(0.62, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); });
const bandTex = canvasTex(256, 64, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  const v = x.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.5, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)'); x.globalCompositeOperation = 'destination-in'; x.fillStyle = v; x.fillRect(0, 0, w, h); });
const smokeTex = canvasTex(256, 256, (x, w) => { const r = mulberry(31); for (let i = 0; i < 46; i++) { const a = r() * 6.28, d = Math.pow(r(), 0.8) * w * 0.3, X = w / 2 + Math.cos(a) * d, Y = w / 2 + Math.sin(a) * d * 0.7, R = Math.min(18 + r() * 44, w / 2 - Math.max(Math.abs(X - w / 2), Math.abs(Y - w / 2)) - 2); if (R < 6) continue;
  const g = x.createRadialGradient(X, Y, 0, X, Y, R); g.addColorStop(0, 'rgba(255,255,255,0.13)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(X - R, Y - R, R * 2, R * 2); }
  const m = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.45, 'rgba(0,0,0,0.8)'); m.addColorStop(1, 'rgba(0,0,0,0)'); x.globalCompositeOperation = 'destination-in'; x.fillStyle = m; x.fillRect(0, 0, w, w); });
const glintTex = canvasTex(256, 256, (x, w) => { const c = w / 2, g = x.createRadialGradient(c, c, 0, c, c, 26); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w);
  const arm = (len, th, a) => { const l = x.createLinearGradient(c - len, 0, c + len, 0); l.addColorStop(0, 'rgba(255,255,255,0)'); l.addColorStop(0.5, `rgba(255,255,255,${a})`); l.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = l; x.fillRect(c - len, c - th / 2, len * 2, th); };
  arm(126, 2.2, 0.95); arm(70, 5, 0.25); x.translate(c, c); x.rotate(Math.PI / 2); x.translate(-c, -c); arm(46, 1.8, 0.8); });
const starTex = canvasTex(64, 64, (x, w) => { const c = w / 2, g = x.createRadialGradient(c, c, 0, c, c, c); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,240,200,0.8)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w);
  x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(c - 0.7, 2, 1.4, w - 4); x.fillRect(2, c - 0.7, w - 4, 1.4); });

/* ---------- three studios, painted ---------- */
// What polished metal looks like is what it reflects. Each studio is painted as a panorama by angle
// (azimuth 0 is behind the camera, where the letter faces look; + is the right of the frame; 180 is
// behind the word) and anything painted near white is turned up far past white, so the softboxes burn.
const pmrem = new THREE.PMREMGenerator(renderer);
function studio(paint) {
  const w = 1024, h = 512, c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  const U = az => (0.75 - az / 360) * w, Y = el => (0.5 - el / 180) * h;
  const P = {
    sky(el0, el1, stops) { const g = x.createLinearGradient(0, Y(el0), 0, Y(el1)); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); x.fillStyle = g; x.fillRect(0, Y(el0), w, Y(el1) - Y(el0)); },
    box(az0, az1, el0, el1, col, a = 1) { x.globalAlpha = a; x.fillStyle = col; for (const o of [-w, 0, w]) x.fillRect(U(az1) + o, Y(el1), U(az0) - U(az1), Y(el0) - Y(el1)); x.globalAlpha = 1; },
    glow(az, el, rad, col, a = 1) { const R = rad / 360 * w; for (const o of [-w, 0, w]) { const X = U(az) + o, g = x.createRadialGradient(X, Y(el), 0, X, Y(el), R); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.globalAlpha = a; x.fillStyle = g; x.fillRect(X - R, Y(el) - R, R * 2, R * 2); x.globalAlpha = 1; } },
  };
  paint(P);
  const d = x.getImageData(0, 0, w, h).data, out = new Uint16Array(w * h * 4), lin = Array.from({ length: 256 }, (_, i) => { const v = i / 255; return v < 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) { const s = ((h - 1 - y) * w + i) * 4, o = (y * w + i) * 4, m = Math.min(d[s], d[s + 1], d[s + 2]) / 255, k = 1 + 7 * Math.pow(m, 3);
    for (let ch = 0; ch < 3; ch++) out[o + ch] = THREE.DataUtils.toHalfFloat(Math.min(lin[d[s + ch]] * k, 64)); out[o + 3] = THREE.DataUtils.toHalfFloat(1); }
  const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.HalfFloatType); tex.mapping = THREE.EquirectangularReflectionMapping; tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = THREE.RepeatWrapping; tex.needsUpdate = true;
  const env = pmrem.fromEquirectangular(tex).texture; tex.dispose(); return env;
}
// the same room three times. Where the letter faces look (a band a dozen degrees high, behind the
// camera) the sky pales down to a white-hot horizon with a dark edge under it and ground light below:
// the hard line across the letters is the oldest chrome trick there is, and it moves when the camera
// does. Thin strips slide across the faces; a box overhead and one each side light the bevels and
// the walls; the light behind the word is in the room too, so the edges that face it burn.
const room = (sky, ground, strip, left, right, back, accent) => studio(P => {
  P.sky(90, 30, [sky[0], sky[1]]); P.sky(30, 12, [sky[1], sky[2]]); P.sky(12, 1.3, [sky[2], sky[3], sky[4], sky[5]]); P.sky(1.3, 0.3, ['#ffffff', '#ffffff']);
  P.sky(0.3, -1.6, [ground[0], ground[1]]); P.sky(-1.6, -8, [ground[1], ground[2]]); P.sky(-8, -40, [ground[2], ground[3]]); P.sky(-40, -90, [ground[3], '#000000']);
  P.box(-180, 180, 66, 90, strip); P.box(-60, 60, 38, 52, strip);
  for (const [a0, a1] of [[-33, -30.4], [-14, -12.8], [7.5, 10.5], [26, 27.1], [43, 46]]) P.box(a0, a1, -5, 30, strip, 0.5);
  if (accent) { P.box(-22.6, -21.5, -5, 30, accent, 0.9); P.box(17, 17.9, -5, 30, accent, 0.9); }
  P.box(-108, -74, -8, 44, left); P.box(74, 106, -8, 44, right);
  P.glow(180, 9, 50, back, 0.9); P.glow(180, 7, 16, '#ffffff'); P.glow(180, -14, 40, back, 0.4);
});
const ENV = [
  room(['#00030a', '#031033', '#082a8c', '#1a4fc4', '#5a90e6', '#bcd6f8'], ['#02040a', '#0a1322', '#4a6a9e', '#0a1424'], '#f4f8ff', '#1f44ff', '#e6f0ff', '#3f74ff', '#ffb070'),
  room(['#060000', '#2c0500', '#7a1503', '#c23406', '#f6701a', '#ffb468'], ['#0a0200', '#1c0500', '#b8380a', '#200600'], '#ffe6c8', '#ff2a08', '#ffb866', '#ff5a1c', null),
  room(['#050300', '#2a1602', '#4a2804', '#8a4e0a', '#cf851c', '#ffd98a'], ['#080401', '#1a0c02', '#c47a18', '#221002'], '#fff6e2', '#ff8a10', '#fff0d2', '#ffb030', '#8fb8ff'),
];

/* ---------- the words ---------- */
const ttf = await new Promise((res, rej) => new TTFLoader().load(fontUrl, res, undefined, rej));
const font = new Font(ttf);
const metal = (face, side, env, k, extra = {}) => [
  new THREE.MeshStandardMaterial({ color: face, metalness: 1, roughness: 0.17, roughnessMap: roughTex, normalMap: normalTex, normalScale: new THREE.Vector2(0.045, 0.045), envMap: env, envMapIntensity: k, ...extra }),
  new THREE.MeshStandardMaterial({ color: side, metalness: 1, roughness: 0.34, roughnessMap: roughTex, envMap: env, envMapIntensity: k, ...extra })];
const clipSteel = new THREE.Plane(new THREE.Vector3(1, 0, 0), 99), clipCopper = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 99);
const MATS = {
  steel: metal(0xdfe6f2, 0x8fa0c0, ENV[0], 1.0),
  steel2: metal(0xdfe6f2, 0x8fa0c0, ENV[0], 1.0, { clippingPlanes: [clipSteel] }),
  copper: metal(0xff9a62, 0xd0582a, ENV[1], 1.0, { clippingPlanes: [clipCopper], emissive: 0xff4a12, emissiveMap: heatTex, emissiveIntensity: 0 }),
  gold: metal(0xffb347, 0xe8821a, ENV[2], 1.0),
};
const occScene = new THREE.Scene(); occScene.background = new THREE.Color(0x000000);
const occMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
const words = E.WORDS.map((w, i) => {
  const geo = new TextGeometry(w, { font, size: 1, depth: 0.4, curveSegments: 8, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.03, bevelSegments: 4 });
  geo.computeBoundingBox(); const b = geo.boundingBox; geo.translate(-(b.max.x + b.min.x) / 2, -b.min.y, -(b.max.z + b.min.z) / 2);     // standing on the floor
  const s = Math.min(8.6 / (b.max.x - b.min.x), 2.45 / (b.max.y - b.min.y));
  const parts = (i === 0 ? [MATS.steel] : i === 1 ? [MATS.steel2, MATS.copper] : [MATS.gold]).map(m => { const mesh = new THREE.Mesh(geo, m); mesh.scale.setScalar(s); mesh.visible = false; scene.add(mesh); return mesh; });
  const occ = new THREE.Mesh(geo, occMat); occ.scale.setScalar(s); occ.visible = false; occScene.add(occ);
  return { parts, occ, w: (b.max.x - b.min.x) * s, h: (b.max.y - b.min.y) * s, d: (b.max.z - b.min.z) * s };
});

/* ---------- the floor ---------- */
const floor = new Reflector(new THREE.PlaneGeometry(160, 160), { color: 0xffffff, textureWidth: 512, textureHeight: 512, clipBias: 0.003, multisample: 0,
  shader: { name: 'IntroFloor', vertexShader: FLOOR_VS, fragmentShader: FLOOR_FS, uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, tNoise: { value: floorTex },
    bg: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() }, sunPos: { value: new THREE.Vector3() }, ring: { value: new THREE.Vector3(0, 1, 0) }, ringCol: { value: new THREE.Color() }, amount: { value: 0.55 * T.floor }, fade: { value: new THREE.Vector2(15, 40) } } } });
floor.rotation.x = -Math.PI / 2; scene.add(floor); floor.visible = T.floor > 0;
// the mirror image is drawn before the scene, not in the middle of it: leaving a half-drawn multisampled buffer and
// coming back to it costs a store and a load of every sample on a tile renderer (3 ms of a 1080p frame on an M1)
const reflect = floor.onBeforeRender; floor.onBeforeRender = () => {};
const FU = floor.material.uniforms; FU.tNoise.value = floorTex;

/* ---------- the light behind the word ---------- */
const add = (map, extra = {}) => new THREE.SpriteMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, ...extra });
const sunPos = new THREE.Vector3();
const sunCore = new THREE.Sprite(add(softTex)), sunHalo = new THREE.Sprite(add(softTex)), horizon = new THREE.Sprite(add(bandTex));
sunCore.scale.setScalar(2.6); sunHalo.scale.setScalar(17); horizon.scale.set(120, 4.2, 1); horizon.position.set(0, 0.5, -38); scene.add(sunCore, sunHalo, horizon);
const occSun = new THREE.Sprite(new THREE.SpriteMaterial({ map: occTex, depthWrite: false })); occSun.scale.setScalar(6.2); occScene.add(occSun);
const back = new THREE.PointLight(0xffffff, 0, 0, 2); scene.add(back);                    // the same light, on the metal's edges
const key = new THREE.PointLight(0xffffff, 0, 40, 1.2); scene.add(key);                   // a glint that crosses the faces
const glint = new THREE.Sprite(add(glintTex, { depthTest: false })); scene.add(glint);
// CHANGES.: the hot line, and what it lights
const line = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: bandTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })); line.visible = false; scene.add(line);
const lineGlow = new THREE.Mesh(line.geometry, line.material.clone()); lineGlow.visible = false; scene.add(lineGlow);
const lineLight = new THREE.PointLight(0xff7a2a, 0, 9, 1.6); scene.add(lineLight);

/* ---------- haze, dust, sparks, glitter ---------- */
const rH = mulberry(77), haze = Array.from({ length: 14 }, (_, k) => { const s = new THREE.Sprite(add(smokeTex)); scene.add(s);
  return { s, x: rH() * 20 - 10, y: 0.9 + rH() * 3.2, z: k < 3 ? 2 + rH() * 3 : -1.5 - rH() * 8, size: 7 + rH() * 7, v: (rH() - 0.5) * 0.35, ph: rH() * 6.28, k: 0.6 + rH() * 0.8 }; });
function cloud(n, size) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: starTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false }));
  pts.frustumCulled = false; scene.add(pts); return pts;
}
function streaks(n) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 6), 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 6), 3));
  const ls = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  ls.frustumCulled = false; scene.add(ls); return ls;
}
const DUST = 2600, dust = cloud(DUST, 0.085), r0 = mulberry(11), dustSeed = Array.from({ length: DUST }, () => [r0() * 26 - 13, 0.15 + r0() * 9, r0() * -24 + 8, r0() * 6.28, 0.6 + r0() * 3, r0() * 0.12, r0()]);
const BURST = 600, bursts = E.HITS.map(() => cloud(BURST, 0.075)), burstSeed = E.HITS.map((_, h) => { const r = mulberry(40 + h); return Array.from({ length: BURST }, () => { const a = r() * 6.28, e = r() * 1.35; return [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e) * 0.6 + 0.3, 2 + r() * 8, 0.6 + r() * 1.6, r()]; }); });
// sparks off the floor where a word lands: x along the word, mostly thrown toward the camera, one skip off the floor
const SPARK = 520, sparks = E.HITS.map(() => streaks(SPARK)), sparkSeed = E.HITS.map((_, h) => { const r = mulberry(90 + h); return Array.from({ length: SPARK }, () => [r() - 0.5, (r() - 0.5) * 3.4, 1.2 + Math.pow(r(), 1.6) * 6.5, (r() < 0.72 ? 1 : -1) * (0.6 + r() * 5.2), 0.35 + r() * 1.0, r()]); });
// and off the hot line as it crosses CHANGES.
const SHED = 360, shed = streaks(SHED), rS = mulberry(131), shedSeed = Array.from({ length: SHED }, () => [rS(), rS(), (rS() - 0.5) * 2.6, 0.4 + rS() * 2.6, 0.6 + rS() * 3.4, 0.3 + rS() * 0.7, rS()]);
// the riser: glitter leaving the floor around EVERYTHING., more of it every moment
const RISE = 1300, fountain = cloud(RISE, 0.12), rR = mulberry(151), riseSeed = Array.from({ length: RISE }, () => [Math.pow(rR(), 0.75), (rR() - 0.5) * 1.3, rR() * 4.4 - 1.6, 0.8 + rR() * 2.6, rR() * 6.28, 0.5 + rR() * 2.5, rR()]);

/* ---------- the picture pipeline ---------- */
const occRT = new THREE.WebGLRenderTarget(4, 4), raysRT = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
const raysQuad = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tOcc: { value: occRT.texture }, light: { value: new THREE.Vector2(0.5, 0.5) }, time: { value: 0 }, aspect: { value: W / H } }, vertexShader: QUAD_VS, fragmentShader: RAYS_FS, depthTest: false, depthWrite: false }));
// the scene is drawn once into its own anti-aliased buffer; the passes after it work on plain ones (a pass that writes
// into a multisampled buffer pays for the resolve every time, which was half the frame)
const sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: T.msaa });
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W * pixelRatio, H * pixelRatio, { type: THREE.HalfFloatType, depthBuffer: false }));
composer.addPass(new TexturePass(sceneRT.texture));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.2, 0.5, 1.25);
composer.addPass(bloom); bloom.enabled = T.bloom > 0;
const lens = new ShaderPass(new THREE.ShaderMaterial({ toneMapped: false, vertexShader: QUAD_VS, fragmentShader: LENS_FS, uniforms: { tDiffuse: { value: null }, tRays: { value: raysRT.texture }, tOcc: { value: occRT.texture },
  light: { value: new THREE.Vector2(0.5, 0.5) }, hue: { value: new THREE.Color() }, core: { value: new THREE.Color() }, rays: { value: 0 }, flare: { value: 0 }, ca: { value: 0 },
  exposure: { value: 1 }, time: { value: 0 }, aspect: { value: W / H }, grain: { value: 0.022 } } }));
composer.addPass(lens);
const LU = lens.uniforms, RU = raysQuad.material.uniforms;
function sizeTargets() { const w = Math.round(W * pixelRatio), h = Math.round(H * pixelRatio); sceneRT.setSize(w, h); occRT.setSize(Math.ceil(w / 2), Math.ceil(h / 2)); raysRT.setSize(Math.ceil(w / 2), Math.ceil(h / 2)); floor.getRenderTarget().setSize(Math.ceil(w * T.floorRes), Math.ceil(h * T.floorRes)); LU.aspect.value = RU.aspect.value = W / H; }
sizeTargets();

/* ---------- the story, as functions of time ---------- */
const rise = t => Math.pow(clamp((t - E.RISER[0]) / (E.RISER[1] - E.RISER[0])), 2);
const until = i => i < 2 ? E.WORD_OUT[i] : Infinity;
// where a word is: in the air (it comes over the camera's shoulder and down), landed, or sliding away into the dark
function wordState(i, t) {
  const u = t - E.HITS[i], out = until(i);
  if (u < -FLY || t >= out + 0.4) return null;
  let x = 0, y = 0, z = 0, rx = 0, ry = 0;
  if (u < 0) { const k = (u + FLY) / FLY, e = 1 - Math.pow(k, 2.6); y = 5.4 * e; z = 7.6 * e; rx = 0.55 * e; ry = (i === 1 ? -0.5 : 0.5) * e; }
  else { y = 0.085 * Math.exp(-u * 11) * Math.abs(Math.sin(u * 25)); ry = 0.035 * Math.sin(u * 1.1 + i * 2) + (i === 2 ? -0.012 : 0.01) * u; rx = -0.012 * Math.exp(-u * 6) * Math.sin(u * 25); }
  if (t > out) { const k = (t - out) / 0.4; z -= 36 * k * k; ry += 0.25 * k * k; }
  return { x, y, z, rx, ry, u };
}
// how bright the light behind the word is: on at the hit with a surge, a slow flutter, out as the word leaves, up with the riser
function sunLevel(t) {
  let s = 0;
  E.HITS.forEach((h, i) => { const u = t - h; if (u < 0) return; let v = (1 - Math.exp(-u * 12)) * (0.86 + 0.14 * Math.sin(u * 8.3 + i) * Math.sin(u * 21)) + 0.9 * Math.exp(-u * 8); if (t > until(i)) v *= 1 - smooth((t - until(i)) / 0.3); s = Math.max(s, v); });
  s *= 1 + 0.75 * rise(t);
  return s;
}
// the camera: azimuth (degrees), height, distance, how high it looks; straight lines while a word stands, a swing between
const KEYS = [[0, -19, 0.5, 9.9], [E.HITS[0], -16, 0.55, 9.6], [E.WORD_OUT[0], -6, 0.95, 8.7], [E.HITS[1], 16, 0.55, 11.6], [E.WORD_OUT[1], 6, 0.95, 10.5], [E.HITS[2], -7, 0.45, 12.4], [E.RISER[1], 4.5, 0.9, 9.9]];
function shot(t) {
  let i = 0; while (i < KEYS.length - 2 && t >= KEYS[i + 1][0]) i++;
  const a = KEYS[i], b = KEYS[i + 1]; let k = clamp((t - a[0]) / (b[0] - a[0]));
  if (i === 2 || i === 4) k = k * k * k * (k * (k * 6 - 15) + 10);            // the swings ease in and out
  if (i === 5) k = lerp(k, k * k, 0.55);                                      // the last push gathers speed
  const wi = t < E.HITS[1] - FLY ? 0 : t < E.HITS[2] - FLY ? 1 : 2, wk = wi === 0 ? 0 : smooth((t - (E.HITS[wi] - FLY)) / FLY), ty = lerp(wi ? words[wi - 1].h : words[0].h, words[wi].h, wk) * 0.47;
  return { az: lerp(a[1], b[1], k) * Math.PI / 180, h: lerp(a[2], b[2], k), D: lerp(a[3], b[3], k), ty };
}

const hue = new THREE.Color(), core = new THREE.Color(), bg = new THREE.Color(), spark = new THREE.Color(), tmp = new THREE.Color(), v3 = new THREE.Vector3();
const mix3 = (out, key, m01, m12) => out.copy(LOOK[0][key]).lerp(LOOK[1][key], m01).lerp(LOOK[2][key], m12);

function render(t, ambient = t) {
  const a = ambient, R = rise(t);
  /* the colour of the moment */
  const heatP = clamp((t - E.HITS[1] - HEAT[0]) / HEAT[1]), m01 = smooth(heatP * 1.25), m12 = smooth((t - (E.HITS[2] - 0.62)) / 0.3);
  mix3(hue, 'hue', m01, m12); mix3(core, 'core', m01, m12); mix3(bg, 'bg', m01, m12); mix3(spark, 'spark', m01, m12);
  let far0 = 0; if (t >= 0 && t < E.HITS[0]) for (let k = 0.2; k < E.HITS[0]; k += 0.5) if (t >= k) far0 += Math.exp(-(t - k) * 7) * (0.6 + 0.4 * Math.sin((t - k) * 60));    // before anything: far-off flickers on the ticks
  const S = sunLevel(t) * T.sun, S0 = S / (1 + 0.75 * R);                         // S0: the light without the riser, for what should not fog up
  scene.background.copy(bg); scene.fog.color.copy(bg);

  /* camera: low, drifting, shaken by every hit and by the riser */
  const sh = shot(t), rs = mulberry(Math.floor(t * 30) * 13 + 1);
  let shake = 0; E.HITS.forEach(h => { if (t >= h) shake += 0.26 * Math.exp(-(t - h) * 7); }); shake += R * 0.075;
  const far = Math.max(1, (16 / 9) / (W / H)), D = sh.D * far;                                                    // narrower screens stand further back
  scene.fog.near = 15 * far; scene.fog.far = 40 * far; FU.fade.value.set(15 * far, 40 * far);                     // and the dark starts further away for them
  camera.position.set(Math.sin(sh.az) * D + (rs() - 0.5) * shake, sh.h + (rs() - 0.5) * shake * 0.7 + 0.04 * Math.sin(a * 0.6), Math.cos(sh.az) * D);
  camera.lookAt(0, sh.ty, 0); camera.rotation.z += (rs() - 0.5) * shake * 0.05 - sh.az * 0.045; camera.updateMatrixWorld();

  /* the words */
  let flash = 0, live = -1;
  words.forEach((w, i) => {
    const s = wordState(i, t); w.occ.visible = !!s; w.parts.forEach(m => { m.visible = !!s; }); if (!s) return;
    if (s.u >= 0) { live = i; flash = Math.max(flash, Math.exp(-s.u * 13)); }
    for (const m of [...w.parts, w.occ]) { m.position.set(s.x, s.y, s.z); m.rotation.set(s.rx, s.ry, 0); }
  });
  const lw = live >= 0 ? words[live] : words[0], since = live >= 0 ? t - E.HITS[live] : 0;
  // CHANGES.: steel on one side of the line, copper on the other
  const w1 = words[1], lineX = lerp(-w1.w / 2 - 0.35, w1.w / 2 + 0.35, heatP), crossing = heatP > 0 && heatP < 1 && !!wordState(1, t);
  clipSteel.constant = -lineX; clipCopper.constant = lineX;
  if (w1.parts[0].visible) { w1.parts[0].visible = heatP < 1; w1.parts[1].visible = heatP > 0; }
  const cool = t - (E.HITS[1] + HEAT[0]); MATS.copper.forEach(m => { m.emissiveIntensity = heatP > 0 ? 0.5 + 3.2 * Math.exp(-Math.max(0, cool - 0.1) * 2.2) : 0; });
  line.visible = lineGlow.visible = crossing; lineLight.intensity = crossing ? 60 : 0;
  if (crossing) { const pulse = 0.85 + 0.15 * Math.sin(t * 70); line.position.set(lineX, w1.h / 2, w1.d / 2 + 0.05); const ends = smooth(heatP / 0.06) * (1 - smooth((heatP - 0.9) / 0.1)); line.scale.set(0.13, w1.h + 0.1, 1); line.material.color.setRGB(16, 12, 7).multiplyScalar(pulse * ends);
    lineGlow.position.set(lineX - 0.12, w1.h / 2, w1.d / 2 + 0.04); lineGlow.scale.set(1.5, w1.h + 0.7, 1); lineGlow.material.color.setRGB(2.0, 0.62, 0.12).multiplyScalar(pulse * ends); lineLight.position.set(lineX - 0.25, w1.h * 0.55, 1.3); }

  /* the light behind */
  const crest = lw.h + (lw.h - camera.position.y) * (4.6 / D);                     // where the top edge of the letters is, seen from the camera, at the light's depth
  sunPos.set(0.5 * Math.sin(a * 0.21 + 1) + (live === 1 ? 0.9 : live === 2 ? -0.7 : 0.35), crest + lerp(-0.5, live === 2 ? 0.3 : 0.18, smooth(since / 2.2)), -4.6);
  sunCore.position.copy(sunPos); sunHalo.position.copy(sunPos).setZ(-5.4); occSun.position.copy(sunPos);
  sunCore.material.color.copy(core).multiplyScalar(S * 1.0); sunHalo.material.color.copy(hue).multiplyScalar(S0 * 0.04 + 0.004 + 0.012 * far0);
  horizon.material.color.copy(hue).multiplyScalar(S0 * 0.07 + 0.02 + 0.16 * far0);
  occSun.material.color.setScalar(clamp(S * 0.8));
  back.position.copy(sunPos); back.color.copy(hue).lerp(core, 0.4); back.intensity = S * 40;
  v3.copy(sunPos).project(camera); LU.light.value.set(v3.x * 0.5 + 0.5, v3.y * 0.5 + 0.5); RU.light.value.copy(LU.light.value);
  LU.hue.value.copy(hue); LU.core.value.copy(core);
  LU.rays.value = Math.min(S, 3.2) * 0.5 * T.rays; LU.flare.value = S * 0.1 * T.flare;
  LU.ca.value = 0.003 + 0.02 * flash + 0.004 * R; LU.exposure.value = 1.0 + 0.55 * flash + 0.06 * R;                     // a hit is a jump in exposure, not a veil of white
  LU.time.value = RU.time.value = a;
  bloom.strength = (0.2 + 0.3 * flash + 0.1 * R) * T.bloom;
  MATS.steel.concat(MATS.steel2, MATS.copper).forEach(m => { m.envMapIntensity = T.env; }); MATS.gold.forEach(m => { m.envMapIntensity = (0.74 + 0.14 * R) * T.env; });
  // a glint crosses the faces of the standing word, faster as the riser climbs
  const sweep = live >= 0 ? ((since * (0.4 + R * 1.5) + 0.25) % 1.5) / 1.5 : 0, gx = lerp(-lw.w / 2 - 0.4, lw.w / 2 + 0.4, sweep), on = live >= 0 && !(live < 2 && t > until(live));
  key.position.set(gx, lw.h * 0.7, 5.5); key.intensity = on ? 6 * (1 - flash) : 0; key.color.copy(core);
  const gl = on ? Math.pow(Math.sin(sweep * Math.PI), 2) * (0.5 + 0.5 * Math.sin(since * 9 + 1)) : 0;
  glint.position.set(gx, lw.h * (0.66 + 0.18 * Math.sin(sweep * 9)), lw.d / 2 + 0.3); glint.scale.setScalar(1.5 + 1.9 * gl); glint.material.color.copy(core).multiplyScalar(1.9 * gl * (1 - flash));

  /* the floor */
  FU.bg.value.copy(bg); FU.sunPos.value.copy(sunPos); FU.sunCol.value.copy(hue).multiplyScalar(S);
  let ru = 99; E.HITS.forEach(h => { if (t >= h) ru = t - h; });
  FU.ring.value.set(0.6 + 21 * (1 - Math.exp(-ru * 2.2)), 0.07 + ru * 0.3, 1.5 * Math.exp(-ru * 3.6)); FU.ringCol.value.copy(hue).lerp(core, 0.5);

  /* haze: lit by the light, barely there without it */
  haze.forEach(({ s, x, y, z, size, v, ph, k }, n) => { s.visible = T.haze > 0;
    s.position.set(((x + v * a + 13) % 26 + 26) % 26 - 13, y + 0.25 * Math.sin(a * 0.3 + ph), z); s.scale.setScalar(size); s.material.rotation = ph + a * 0.04 * (n % 2 ? 1 : -1);
    s.material.color.copy(hue).lerp(core, 0.18).multiplyScalar((0.003 + S0 * 0.014) * k * (z > 0 ? 0.4 : 1) * T.haze);
  });
  /* dust in the air: drifting, twinkling in the colour of the light, swirling in the riser */
  const dp = dust.geometry.attributes.position.array, dc = dust.geometry.attributes.color.array;
  dustSeed.forEach(([x, y, z, ph, f, v, w], k) => {
    const sw = R * 2.4 * t * (0.2 + w * 0.3);
    dp[k * 3] = x * Math.cos(sw) - (z + 4) * 0.1 * Math.sin(sw); dp[k * 3 + 1] = 0.15 + (((y + Math.sin(a * 0.4 + ph) * 0.3 + v * a) % 9) + 9) % 9; dp[k * 3 + 2] = z;
    const tw = Math.pow(0.5 + 0.5 * Math.sin(a * f * 2.2 + ph), 8) * (0.42 + S * 0.5 + flash * 1.5 + R); tmp.copy(w > 0.7 ? core : spark).lerp(hue, w * 0.5);
    dc[k * 3] = tmp.r * tw; dc[k * 3 + 1] = tmp.g * tw; dc[k * 3 + 2] = tmp.b * tw;
  });
  dust.geometry.attributes.position.needsUpdate = true; dust.geometry.attributes.color.needsUpdate = true; dust.visible = T.dust > 0;
  /* every hit: glitter thrown up and out, and sparks off the floor */
  E.HITS.forEach((hit, h) => {
    const u = t - hit, b = bursts[h], sp = sparks[h], L = LOOK[h === 1 ? 0 : h], wd = words[h];
    b.visible = u >= 0 && u < 2.6; sp.visible = u >= 0 && u < 1.5;
    if (b.visible) { const p = b.geometry.attributes.position.array, c = b.geometry.attributes.color.array;
      burstSeed[h].forEach(([dx, dy, dz, spd, life, ph], k) => {
        const d = spd * (1 - Math.exp(-u * 2.6)), fade = clamp(1 - u / life), y = dy * d * 0.8 + 0.3 - 0.5 * u * u;
        p[k * 3] = dx * d + (ph - 0.5) * wd.w * 0.8; p[k * 3 + 1] = Math.abs(y); p[k * 3 + 2] = dz * d * 0.5 + 0.5;
        const tw = fade * fade * (0.6 + 0.4 * Math.sin(u * 30 + ph * 20)) * 1.7; tmp.copy(ph > 0.6 ? L.core : L.spark);
        c[k * 3] = tmp.r * tw; c[k * 3 + 1] = tmp.g * tw; c[k * 3 + 2] = tmp.b * tw;
      });
      b.geometry.attributes.position.needsUpdate = true; b.geometry.attributes.color.needsUpdate = true; }
    if (sp.visible) { const p = sp.geometry.attributes.position.array, c = sp.geometry.attributes.color.array;
      const at = (seed, uu, o) => { const [x0, vx, vy, vz] = seed; let y = 0.05 + vy * uu - 4.9 * uu * uu; if (y < 0) y = -y * 0.32; p[o] = x0 * wd.w + vx * uu; p[o + 1] = y; p[o + 2] = (vz > 0 ? wd.d / 2 : -wd.d / 2) + vz * uu * (1 - 0.25 * uu); };
      sparkSeed[h].forEach((seed, k) => { at(seed, u, k * 6); at(seed, Math.max(0, u - 0.028), k * 6 + 3);
        const fade = Math.pow(clamp(1 - u / seed[4]), 1.5) * (2.2 + 3 * seed[5]); tmp.copy(L.spark).lerp(L.core, 0.5 * seed[5]);
        c[k * 6] = tmp.r * fade; c[k * 6 + 1] = tmp.g * fade; c[k * 6 + 2] = tmp.b * fade; c[k * 6 + 3] = tmp.r * fade * 0.15; c[k * 6 + 4] = tmp.g * fade * 0.15; c[k * 6 + 5] = tmp.b * fade * 0.15; });
      sp.geometry.attributes.position.needsUpdate = true; sp.geometry.attributes.color.needsUpdate = true; }
  });
  /* sparks shed by the hot line */
  const shedT = t - (E.HITS[1] + HEAT[0]); shed.visible = shedT > 0 && shedT < HEAT[1] + 1.1 && !!wordState(1, t);
  if (shed.visible) { const p = shed.geometry.attributes.position.array, c = shed.geometry.attributes.color.array, x0 = -w1.w / 2 - 0.35, span = w1.w + 0.7;
    const at = (seed, uu, o) => { const [bf, yf, vx, vy, vz] = seed; let y = yf * w1.h + vy * uu - 4.9 * uu * uu; if (y < 0) y = -y * 0.3; p[o] = x0 + bf * span + vx * uu; p[o + 1] = y; p[o + 2] = w1.d / 2 + 0.05 + vz * uu; };
    shedSeed.forEach((seed, k) => { const uu = shedT - seed[0] * HEAT[1], alive = uu > 0 && uu < seed[5];
      if (alive) { at(seed, uu, k * 6); at(seed, Math.max(0, uu - 0.03), k * 6 + 3); } else for (let j = 0; j < 6; j++) p[k * 6 + j] = 0;
      const fade = alive ? Math.pow(1 - uu / seed[5], 1.4) * (2.5 + 4 * seed[6]) : 0;
      c[k * 6] = fade; c[k * 6 + 1] = fade * 0.5; c[k * 6 + 2] = fade * 0.16; c[k * 6 + 3] = fade * 0.2; c[k * 6 + 4] = fade * 0.06; c[k * 6 + 5] = 0; });
    shed.geometry.attributes.position.needsUpdate = true; shed.geometry.attributes.color.needsUpdate = true; }
  /* the riser: gold leaving the floor */
  const w2 = words[2]; fountain.visible = t > E.RISER[0];
  if (fountain.visible) { const p = fountain.geometry.attributes.position.array, c = fountain.geometry.attributes.color.array, dur = E.RISER[1] - E.RISER[0];
    riseSeed.forEach(([bf, xf, z0, vy, ph, f, w], k) => { const uu = t - (E.RISER[0] + bf * dur), alive = uu > 0;
      p[k * 3] = alive ? xf * w2.w + Math.sin(uu * 2.4 + ph) * 0.35 : 0; p[k * 3 + 1] = alive ? 0.05 + vy * uu * (1 + 0.6 * uu) : -5; p[k * 3 + 2] = z0 + (alive ? Math.cos(uu * 2 + ph) * 0.3 : 0);
      const tw = alive ? clamp(uu * 6) * (0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(uu * f * 9 + ph), 3)) * 2.8 : 0; tmp.copy(w > 0.75 ? LOOK[2].core : LOOK[2].spark);
      c[k * 3] = tmp.r * tw; c[k * 3 + 1] = tmp.g * tw; c[k * 3 + 2] = tmp.b * tw; });
    fountain.geometry.attributes.position.needsUpdate = true; fountain.geometry.attributes.color.needsUpdate = true; }

  /* draw: the light with the letters black in front of it, the shafts from that, then the scene through the lens */
  renderer.setRenderTarget(occRT); renderer.render(occScene, camera);
  renderer.setRenderTarget(raysRT); raysQuad.render(renderer);
  if (floor.visible) { scene.updateMatrixWorld(); reflect.call(floor, renderer, scene, camera); }
  renderer.setRenderTarget(sceneRT); renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  composer.render();
  return renderer.domElement;
}
function setSize(w, h, pr) { W = w; H = h; if (pr && pr !== pixelRatio) { pixelRatio = pr; renderer.setPixelRatio(pr); composer.setPixelRatio(pr); } renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); sizeTargets(); }
return { render, setSize, canvas: renderer.domElement, dispose() { sceneRT.dispose(); occRT.dispose(); raysRT.dispose(); floor.dispose(); ENV.forEach(e => e.dispose()); pmrem.dispose(); renderer.dispose(); renderer.forceContextLoss(); } };
}
