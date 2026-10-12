import { readFile } from 'node:fs/promises'
import path from 'node:path'

// A bundled font for an OG image (Satori needs a static TTF):
//   const bricolage = await ogFont('bricolage-grotesque/BricolageGrotesque-800.ttf')
// The files live in src/fonts, built by `pnpm fonts:sync` (see src/fonts/README.md);
// nothing fetches Google Fonts at build time, which failed deploys four times.
// For a share-card route that renders at request time, Vercel's file tracing
// follows the src/fonts directory into the function bundle; /drum/og also lists
// its two files in outputFileTracingIncludes in next.config.ts to be sure.
export async function ogFont(file: string): Promise<ArrayBuffer> {
  const buf = await readFile(path.join(process.cwd(), 'src/fonts', file))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}
