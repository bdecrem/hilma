// import.meta.url in the bundle is the bundle's own URL; hand back its path.
export function fileURLToPath(u) {
  try { return new URL(String(u)).pathname; } catch { return String(u); }
}
export function pathToFileURL(p) { return new URL(p, 'file:///'); }
export default { fileURLToPath, pathToFileURL };
