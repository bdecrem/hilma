// Who may read which book, and the parser that turns a reply into a book. No network.
// Usage: npx tsx scripts/semibart/books-test.ts
import { parseBook } from '../../src/lib/semibart/books'
import { visibleBook } from '../../src/lib/semibart/social-handlers'

let failed = 0
const expect = (name: string, got: boolean, detail = '') => { if (!got) failed++; console.log(`${got ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`) }
const book = { form: 'a Western', title: 'A Fistful of Records', subtitle: '', version: 1, pages: Array.from({ length: 10 }, (_, i) => ({ text: `page ${i + 1}`, art: null })) }
const fellow = (c: string) => ({ character: c, role: 'user' }), admin = { character: 'bart', role: 'admin' }

expect('its owner cannot read it before it is finished', visibleBook(book, 'graeme', 9, fellow('graeme')) === null)
expect('nobody else sees an unfinished book', visibleBook(book, 'graeme', 9, fellow('alison')) === null)
const done = visibleBook(book, 'graeme', 10, fellow('alison'))
expect('anyone sees a finished book, whole', !!done && done.unlocked && done.pages.every(Boolean))
const ad = visibleBook(book, 'graeme', 0, admin)
expect('an admin sees every book, whole, before a page is found', !!ad && ad.pages.every(Boolean) && ad.found === 0 && ad.admin)
expect('a count past ten is still ten', visibleBook(book, 'graeme', 14, fellow('alison'))!.found === 10)

const page = (i: number) => i % 2 ? `<page>\n<text>Line ${i}\nsecond line</text>\n<art palette="k:#141414 r:#ff5a1f x:notacolor">\n..kk..\n.krrk.\n</art>\n</page>` : `<page>\n<text>Page ${i}.</text>\n</page>`
const b = parseBook(`<form>a Western</form>\n<title>A Fistful</title>\n<subtitle>sub</subtitle>\n${Array.from({ length: 10 }, (_, i) => page(i)).join('\n')}`)
expect('a whole reply parses: ten pages, text with line breaks, drawings with their palette', !!b && b.pages.length === 10 && b.pages[1].text === 'Line 1\nsecond line' && b.pages[1].art!.rows.length === 2 && b.pages[1].art!.palette.r === '#ff5a1f')
expect('a colour that is not a colour is dropped', !!b && !('x' in b.pages[1].art!.palette))
expect('nine pages is not a book', parseBook(`<title>x</title>${Array.from({ length: 9 }, (_, i) => page(i)).join('')}`) === null)
expect('no title is not a book', parseBook(Array.from({ length: 10 }, (_, i) => page(i)).join('')) === null)
const wide = parseBook(`<title>x</title>${Array.from({ length: 10 }, () => `<page><art palette="k:#000">\n${'k'.repeat(90)}\n</art></page>`).join('')}`)
expect('a drawing too wide is cut to 44', !!wide && wide.pages[0].art!.rows[0].length === 44)
console.log(failed ? `${failed} FAILED` : 'all passed'); process.exit(failed ? 1 : 0)
