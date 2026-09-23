// Pure checks for the doodle layer: the sanitizer keeps the drawing and drops
// everything else; the word gate opens only after three wordless days.
//   npx tsx scripts/onething/doodle-check.ts
import { sanitizeSvg, wordAllowed } from '../../src/lib/onething/doodle'

let fails = 0
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) { fails++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`) } else console.log(`ok   ${name}`)
}

eq('plain paths pass through', sanitizeSvg('<path d="M1 2 L3 4"/><circle cx="1" cy="2" r="3" class="r"/>', { allowText: false }), '<path d="M1 2 L3 4"/><circle cx="1" cy="2" r="3" class="r"/>')
eq('svg wrapper is dropped', sanitizeSvg('<svg viewBox="0 0 340 170"><path d="M1 2"/></svg>', { allowText: false }), '<path d="M1 2"/>')
eq('script and handlers are dropped', sanitizeSvg('<script>alert(1)</script><path d="M1 2" onclick="x()"/><image href="http://x"/>', { allowText: false }), '<path d="M1 2"/>')
eq('style, stroke and fill attributes are dropped', sanitizeSvg('<path d="M1 2" style="fill:red" stroke="blue" fill="url(#g)"/>', { allowText: false }), '<path d="M1 2"/>')
eq('unknown classes are dropped', sanitizeSvg('<path d="M1 2" class="r evil"/><path d="M3 4" class="nope"/>', { allowText: false }), '<path d="M1 2" class="r"/><path d="M3 4"/>')
eq('text stripped when words are not allowed', sanitizeSvg('<path d="M1 2"/><text x="1" y="2">surf day</text>', { allowText: false }), '<path d="M1 2"/>')
eq('text kept when words are allowed', sanitizeSvg('<path d="M1 2"/><text x="1" y="2">surf <b>day</b></text>', { allowText: true }), '<path d="M1 2"/><text x="1" y="2">surf day</text>')
eq('text content is escaped', sanitizeSvg('<text x="1" y="2">a &lt; b</text>', { allowText: true }), '<text x="1" y="2">a &amp;lt; b</text>')
eq('groups nest', sanitizeSvg('<g transform="translate(1 2)"><line x1="0" y1="0" x2="1" y2="1"/></g>', { allowText: false }), '<g transform="translate(1 2)"><line x1="0" y1="0" x2="1" y2="1"/></g>')
eq('nothing drawable is empty', sanitizeSvg('<div>hi</div>', { allowText: false }), '')
eq('too long is empty', sanitizeSvg('<path d="' + 'M1 2 '.repeat(2000) + '"/>', { allowText: false }), '')

const worded = (day: string) => ({ day, doodle_word: 'surf' })
const plain = (day: string) => ({ day, doodle_word: null })
eq('first day: allowed', wordAllowed([], '2026-09-10'), true)
eq('word yesterday: no', wordAllowed([worded('2026-09-09')], '2026-09-10'), false)
eq('word three days ago: no', wordAllowed([worded('2026-09-07'), plain('2026-09-08'), plain('2026-09-09')], '2026-09-10'), false)
eq('word four days ago: yes', wordAllowed([worded('2026-09-06'), plain('2026-09-07'), plain('2026-09-08'), plain('2026-09-09')], '2026-09-10'), true)
eq('a redraw of the same day ignores its own word', wordAllowed([worded('2026-09-10'), plain('2026-09-09')], '2026-09-10'), true)
eq('a later worded day does not block an earlier redraw', wordAllowed([worded('2026-09-12')], '2026-09-10'), true)

if (fails) { console.log(`${fails} failed`); process.exit(1) }
console.log('all ok')
