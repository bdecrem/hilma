import { EXAMPLES } from '@/lib/onething/examples'

// Sample content shared by the three concepts: one person's last ten days.
// Three doodles are the real September examples; the rest are drawn by hand
// in the same vocabulary (340×170 canvas, classes r / thin / f / fr).

export type Day = { iso: string; dow: string; d: number; text?: string; svg?: string }

const BUS = '<path d="M60 130 L60 80 Q60 70 70 70 L250 70 Q262 70 262 82 L262 130 Z"/><path d="M80 82 L110 82 L110 102 L80 102Z M125 82 L155 82 L155 102 L125 102Z M170 82 L200 82 L200 102 L170 102Z" class="thin"/><circle cx="100" cy="134" r="10"/><circle cx="222" cy="134" r="10"/><path d="M20 148 L320 148" class="thin"/><path d="M230 52 L230 22 L250 18 L250 46" class="r"/><ellipse cx="225" cy="52" rx="6" ry="4" class="fr"/><ellipse cx="245" cy="46" rx="6" ry="4" class="fr"/><path d="M285 40 L285 20" class="r"/><ellipse cx="280" cy="40" rx="6" ry="4" class="fr"/>'
const RAIN = '<path d="M150 70 Q140 40 175 42 Q190 20 220 36 Q255 28 262 58 Q288 62 278 82 L152 82 Q132 80 150 70Z"/><path d="M170 95 L164 112 M200 95 L194 112 M230 95 L224 112 M260 95 L254 112" class="r"/><path d="M30 160 L130 160 M24 116 L136 98 M44 112 L44 160 M120 100 L120 160"/><circle cx="82" cy="128" r="6"/><path d="M82 134 L82 152 M82 142 L72 148 M82 142 L92 148"/>'
const RICE = '<path d="M100 90 L240 90 L228 150 Q226 156 220 156 L120 156 Q114 156 112 150 Z"/><path d="M84 96 L100 96 M240 96 L256 96"/><path d="M140 70 q-10 -15 0 -30 q10 -15 0 -30 M175 70 q-10 -15 0 -30 q10 -15 0 -30 M210 70 q-10 -15 0 -30" class="thin"/><path d="M120 120 L220 120" class="r"/><path d="M130 134 l6 -4 l6 4 l6 -4 l6 4 M180 136 l6 -4 l6 4" class="r"/>'
const COAT = '<path d="M90 30 L130 20 L170 40 L210 20 L250 30 L270 150 L70 150 Z"/><path d="M170 40 L170 150" class="thin"/><path d="M196 104 L250 104 L246 142 L200 142 Z"/><path d="M206 104 L212 70 L262 76 L254 106" class="r"/><path d="M240 82 q-8 -4 -12 2 q0 6 8 6 q8 2 6 8 q-4 6 -12 2 M234 78 L234 102" class="r thin"/>'
const LOOP = '<path d="M60 110 Q60 50 170 50 Q280 50 280 110 Q280 150 170 150 Q60 150 60 110Z"/><path d="M70 100 L70 64" class="r"/><path d="M70 64 L96 72 L70 80" class="fr"/><ellipse cx="150" cy="58" rx="7" ry="4" class="f"/><ellipse cx="176" cy="51" rx="7" ry="4" class="f"/><ellipse cx="202" cy="58" rx="7" ry="4" class="f"/><ellipse cx="228" cy="52" rx="7" ry="4" class="f"/>'
const PHONE = '<path d="M80 60 Q70 70 80 90 Q110 140 160 150 Q175 154 182 142 L190 128 L165 114 L155 124 Q120 112 108 80 L120 70 L104 46 Z"/><path d="M210 50 L300 50 M210 72 L290 72 M210 94 L300 94 M210 116 L268 116" class="r thin"/>'

export const DAYS: Day[] = [
  { iso: '2026-10-16', dow: 'Fri', d: 16, text: 'Taught Ines to whistle with two fingers; she got it on the bus home and would not stop.', svg: BUS },
  { iso: '2026-10-15', dow: 'Thu', d: 15, text: EXAMPLES[0].sentence, svg: EXAMPLES[0].svg },
  { iso: '2026-10-14', dow: 'Wed', d: 14, text: 'First rain since May. Stood on the porch and just smelled it.', svg: RAIN },
  { iso: '2026-10-13', dow: 'Tue', d: 13, text: EXAMPLES[2].sentence, svg: EXAMPLES[2].svg },
  { iso: '2026-10-12', dow: 'Mon', d: 12, text: 'Burned the rice, ate it anyway, and the crispy bottom was the best part.', svg: RICE },
  { iso: '2026-10-11', dow: 'Sun', d: 11, text: EXAMPLES[1].sentence, svg: EXAMPLES[1].svg },
  { iso: '2026-10-10', dow: 'Sat', d: 10, text: 'Found a twenty in the pocket of last winter’s coat.', svg: COAT },
  { iso: '2026-10-09', dow: 'Fri', d: 9 },
  { iso: '2026-10-08', dow: 'Thu', d: 8, text: 'Ran the whole loop without stopping for the first time.', svg: LOOP },
  { iso: '2026-10-07', dow: 'Wed', d: 7, text: 'Mom called just to read me a poem she liked.', svg: PHONE },
]

export const TODAY = DAYS[0]
export const STREAK = 7
export const KEPT = 214
export const LEVEL = 'Sapling'
export const NEXT_LEVEL = 'Young tree'

/** Doodles for October's earlier days (the wall-calendar month view). */
const POOL = [BUS, RAIN, RICE, COAT, LOOP, PHONE, ...EXAMPLES.map((e) => e.svg)]
export function octoberCell(d: number): Day | null {
  const hit = DAYS.find((x) => x.d === d)
  if (hit) return hit
  if (d > 16) return null
  if (d === 3) return { iso: `2026-10-0${d}`, dow: '', d } // another missed day
  return { iso: `2026-10-${String(d).padStart(2, '0')}`, dow: '', d, text: 'an earlier day', svg: POOL[(d * 5) % POOL.length] }
}

/** The year so far, Jan 1 → Oct 16, as kept / missed, seeded so it never changes. */
export function yearSoFar(): { month: string; days: (boolean | null)[] }[] {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  return months.map((month, m) => ({
    month,
    days: Array.from({ length: lengths[m] }, (_, i) => {
      if (m > 9 || (m === 9 && i + 1 > 16)) return null
      if (m === 9 && (i + 1 === 9 || i + 1 === 3)) return false
      if (m === 9 && i + 1 >= 10) return true
      if (m < 2) return rnd() < 0.55
      return rnd() < 0.8
    }),
  }))
}
