// createRequire(import.meta.url) is only used by jambot to require JSON.
import { readFileSync } from 'fs';
export function createRequire() {
  return function require(p) {
    if (String(p).endsWith('.json')) return JSON.parse(readFileSync(p, 'utf-8'));
    throw new Error(`require() is not available in the browser bundle: ${p}`);
  };
}
export default { createRequire };
