// Minimal POSIX path shim for the Jambot browser bundle.
function normalize(p) {
  const abs = p.startsWith('/');
  const out = [];
  for (const s of p.split('/')) {
    if (!s || s === '.') continue;
    if (s === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else if (!abs) out.push('..'); }
    else out.push(s);
  }
  return (abs ? '/' : '') + out.join('/');
}
export function join(...parts) { return normalize(parts.filter(Boolean).join('/')); }
export function resolve(...parts) {
  let p = '';
  for (const part of parts) p = part.startsWith('/') ? part : (p ? p + '/' + part : part);
  if (!p.startsWith('/')) p = '/' + p;
  return normalize(p);
}
export function dirname(p) { const n = normalize(p); const i = n.lastIndexOf('/'); return i <= 0 ? (n.startsWith('/') ? '/' : '.') : n.slice(0, i); }
export function basename(p, ext) { const n = normalize(p); let b = n.slice(n.lastIndexOf('/') + 1); if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length); return b; }
export function extname(p) { const b = basename(p); const i = b.lastIndexOf('.'); return i <= 0 ? '' : b.slice(i); }
export const sep = '/';
export default { join, resolve, dirname, basename, extname, sep };
