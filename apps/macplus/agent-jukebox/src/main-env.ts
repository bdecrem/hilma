/*
 * main-env.ts — side-effect module: populate ANTHROPIC_API_KEY (and friends)
 * from a .env.local when the process environment doesn't provide them.
 * Used by main.ts and selftest.ts.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function loadEnvLocal(): void {
  if (process.env.ANTHROPIC_API_KEY) return;
  const here = dirname(fileURLToPath(import.meta.url));
  for (const dir of [
    join(here, '..'),                            // the agent-surf package root
    join(here, '..', '..', '..', '..'),          // hilma repo root
    process.cwd(),
    process.env.HOME ?? '',
  ]) {
    try {
      const text = readFileSync(join(dir, '.env.local'), 'utf8');
      for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const k = line.slice(0, eq).trim();
        let v = line.slice(eq + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
          v = v.slice(1, -1);
        if (k && !(k in process.env)) process.env[k] = v;
      }
      if (process.env.ANTHROPIC_API_KEY) return;
    } catch {
      /* keep looking */
    }
  }
}

loadEnvLocal();
