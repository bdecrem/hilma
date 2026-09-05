// Virtual read-only file system for the Jambot browser bundle.
// The build script injects `virtual:jam-files` with every JSON/WAV that
// jambot reads at runtime (params, library, presets, JT90 samples).
import { FILES } from 'virtual:jam-files';

const HOME = '/home/jam';

function segs(p) {
  return String(p).replace(/\\/g, '/').split('/').filter(s => s && s !== '.');
}

// Longest-suffix match: jambot computes paths from import.meta.url, which in
// a bundle is the bundle's own URL, so the directory layout is lost. Match
// the trailing path segments against the real repo-relative keys instead.
function find(p, keys) {
  if (String(p).startsWith(HOME)) return null;
  const s = segs(p);
  for (let k = s.length; k >= 1; k--) {
    const suffix = s.slice(s.length - k).join('/');
    const hits = keys.filter(key => key === suffix || key.endsWith('/' + suffix));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1 && k === 1) return hits[0];
  }
  return null;
}

const fileKeys = Object.keys(FILES.files);
const dirKeys = Object.keys(FILES.dirs);

function decodeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const binCache = new Map();

export function readFileSync(p, enc) {
  const key = find(p, fileKeys);
  if (!key) {
    const err = new Error(`ENOENT: no such file (browser bundle): ${p}`);
    err.code = 'ENOENT';
    throw err;
  }
  const entry = FILES.files[key];
  if (entry.text !== undefined) return entry.text;
  if (!binCache.has(key)) binCache.set(key, decodeBase64(entry.base64));
  return binCache.get(key);
}

export function existsSync(p) {
  return !!(find(p, fileKeys) || find(p, dirKeys));
}

export function readdirSync(p, opts) {
  const key = find(p, dirKeys);
  if (!key) {
    const err = new Error(`ENOENT: no such directory (browser bundle): ${p}`);
    err.code = 'ENOENT';
    throw err;
  }
  const names = FILES.dirs[key];
  if (opts && opts.withFileTypes) {
    return names.map(name => ({
      name,
      isDirectory: () => dirKeys.includes(`${key}/${name}`),
      isFile: () => !dirKeys.includes(`${key}/${name}`),
    }));
  }
  return [...names];
}

export function mkdirSync() { /* read-only */ }
export function unlinkSync() { /* read-only */ }
export function writeFileSync(p) { throw new Error(`Cannot write files in the browser (${p})`); }
export function copyFileSync(p) { throw new Error(`Cannot copy files in the browser (${p})`); }
export function statSync(p) {
  if (!existsSync(p)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
  const isDir = !!find(p, dirKeys) && !find(p, fileKeys);
  return { isDirectory: () => isDir, isFile: () => !isDir, size: 0, mtime: new Date(0) };
}

export default { readFileSync, existsSync, readdirSync, mkdirSync, unlinkSync, writeFileSync, copyFileSync, statSync };
