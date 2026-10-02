// Doodles Opus 5.5 drew for Bart's own September: the style examples in the
// doodle prompt (doodle.ts), and the sample cards on the landing page and the
// OpenGraph image. Pure data + one helper, safe for client, server and edge.

export type Example = { sentence: string; alt: string; svg: string }

export const EXAMPLES: Example[] = [
  {
    sentence: 'Woke up with the answer to the thing that stumped me all week, before the sun was even up.',
    alt: 'a sun rising over the horizon, a small flame',
    svg: '<path d="M20 140 L320 140"/><path d="M110 140 A60 60 0 0 1 230 140"/><path d="M170 60 L170 40 M120 80 L106 66 M220 80 L234 66 M95 115 L75 110 M245 115 L265 110"/><path d="M150 118 Q170 90 190 118 Q180 128 170 128 Q160 128 150 118Z" class="r"/><path d="M162 128 L162 134 L178 134 L178 128" class="r"/><path d="M280 40 Q300 20 310 45 Q290 60 280 40Z"/><path d="M40 60 q10 -10 20 0 q10 -10 20 0" class="thin"/>',
  },
  {
    sentence: 'Walked the cliffs with the dog, then came home to find the kids had built a castle out of every cushion in the house.',
    alt: 'cliffs, a dog, and a cushion castle',
    svg: '<path d="M10 120 Q60 70 110 95 Q140 60 180 90"/><path d="M10 150 Q100 135 200 150"/><path d="M230 150 L230 90 L320 90 L320 150Z"/><path d="M225 90 Q275 55 325 90" class="r"/><path d="M262 150 L262 118 L288 118 L288 150"/><ellipse cx="80" cy="140" rx="20" ry="11"/><circle cx="102" cy="130" r="8"/><path d="M58 138 q-10 -12 -4 -20"/><path d="M60 108 L64 100 M72 106 L72 97" class="r"/>',
  },
  {
    sentence: 'Finally untangled the dependency mess that has been eating the afternoons.',
    alt: 'a tangled line running out straight to a check mark',
    svg: '<path d="M60 40 Q140 20 120 70 Q100 110 170 90 Q240 70 200 120 Q170 150 260 140"/><path d="M90 60 q20 -30 40 0 q20 30 40 0 M150 110 q15 -20 30 0" class="thin"/><path d="M40 150 L120 150 L130 120 L50 120Z"/><path d="M130 120 L150 60"/><path d="M270 130 l10 10 l24 -30" class="r"/>',
  },
]

/// A doodle's element markup as a standalone SVG document, with the page's
/// classes turned into presentation attributes — for places with no
/// stylesheet (the OpenGraph image renders SVG through an <img>).
export function standaloneSvg(markup: string, o: { ink: string; accent: string; width?: number; viewBox?: string }): string {
  const w = o.width ?? 3.4
  const body = markup
    .replace(/class="r"/g, `stroke="${o.accent}"`)
    .replace(/class="thin"/g, `stroke-width="${(w * 0.55).toFixed(2)}"`)
    .replace(/class="fr"/g, `fill="${o.accent}" stroke="${o.accent}"`)
    .replace(/class="f"/g, `fill="${o.ink}"`)
    .replace(/<text\b/g, `<text stroke="none" fill="${o.ink}" font-size="22"`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o.viewBox ?? '0 0 340 170'}"><g fill="none" stroke="${o.ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
}
