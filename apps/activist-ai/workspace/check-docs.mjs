#!/usr/bin/env node
// Reading real documents, proved inside a sealed workspace (README, "Reading real documents").
// Part of workspace/check.mjs (which calls docChecks on its first workspace); also runs alone,
// on a small workspace of its own, while working on it:
//
//   node workspace/check-docs.mjs        (OLA_CHECK_TAG as in check.mjs; takes one VM slot)
//
// Every file is made up, inside the VM, by testdata/mkdocs.py (a fictional water board, made-up
// papers, hostile files of each kind). The VM has no network, so the hostile files' outside
// addresses (http://127.0.0.1:9) can reach nothing; what is checked here is that nothing of them
// is run, followed or kept as a link.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export async function docChecks({ ws, id, t, measured = {} }) {
  const sh = (args, { input, timeout = 600_000 } = {}) =>
    new Promise((resolve) => {
      const c = spawn(ws.CONTAINER, ['exec', ...(input !== undefined ? ['-i'] : []), ws.names(id).container, ...args], { stdio: ['pipe', 'pipe', 'pipe'] })
      const out = []
      let err = ''
      c.stdout.on('data', (d) => out.push(d))
      c.stderr.on('data', (d) => (err += d))
      const timer = setTimeout(() => c.kill('SIGKILL'), timeout)
      c.on('close', (code) => (clearTimeout(timer), resolve({ code, out: Buffer.concat(out).toString('utf8'), bytes: Buffer.concat(out), err })))
      c.stdin.on('error', () => {})
      c.stdin.end(input ?? undefined)
    })
  const py = (code, input) => sh(['python3', '-I', '-c', code], { input })
  const last = (r) => (r.err.trim().split('\n').pop() ?? '').slice(0, 200)
  const json = (r) => {
    try {
      return JSON.parse(r.out.trim().split('\n').pop())
    } catch {
      return null
    }
  }

  // The made-up documents, written inside the VM.
  let t0 = Date.now()
  const made = await sh(['python3', '-I', '-', '/work/dx', '--beacon', 'http://127.0.0.1:9'], { input: readFileSync(path.join(here, 'testdata/mkdocs.py')) })
  measured.mkdocs_s = (Date.now() - t0) / 1000
  const truth = JSON.parse((await sh(['cat', '/work/dx/truth.json'])).out || '{}')
  t('documents: the made-up files are made inside the workspace (pdftoppm makes the scan)', made.code === 0 && /scan\.pdf/.test(made.out) && truth.two_column, last(made))

  // 1. Reading order.
  const order = await sh(['python3', '-I', '-', '/work/dx'], { input: readFileSync(path.join(here, 'testdata/measure-order.py')) })
  const o = json(order) ?? {}
  measured.reading_order = o
  t('reading order, measured: a two-column paper keeps 0 of 14 sentences whole with -layout (the old way) and 14 of 14 in poppler’s default mode; one column, 7 of 7 either way',
    o['two-column.pdf -layout']?.[0] === 0 && o['two-column.pdf default']?.[0] === 14 && o['one-column.pdf default']?.[0] === 7, JSON.stringify(o))
  const two = json(await sh(['ola-db', 'add', 'dx/two-column.pdf']))
  const quotes = await py(`
import json, sqlite3, sys
sys.path.insert(0, "/opt/ola/lib")
from olatext import find_quote
truth = json.load(open("/work/dx/truth.json"))["two_column"]["pages"]
con = sqlite3.connect("file:/work/project.db?mode=ro", uri=True)
doc = con.execute("SELECT id FROM documents WHERE path = 'dx/two-column.pdf'").fetchone()[0]
found = 0
for i, sentences in enumerate(truth):
    text = con.execute("SELECT text FROM doc_text WHERE doc_id = ? AND page = ?", (doc, i + 1)).fetchone()[0]
    found += sum(1 for s in sentences if find_quote(s, text)[0])
print(json.dumps({"found": found, "of": sum(map(len, truth))}))`)
  const q = json(quotes) ?? {}
  const hit = (await sh(['ola-db', 'search', 'dike repairs'])).out
  t('ola-db indexes a two-column PDF in reading order: every sentence is found by olatext.find_quote on its own page (hyphenated line ends joined), and a search cites page 2',
    two?.pages === 2 && q.found === 14 && q.of === 14 && /two-column\.pdf, page 2/.test(hit) && /doc:dx\/two-column\.pdf#page=2/.test(hit), `${q.found}/${q.of}; ${last(quotes)}`)

  // 2. Scanned pages.
  t0 = Date.now()
  const scan = json(await sh(['ola-db', 'add', 'dx/scan.pdf']))
  measured.ocr_two_pages_s = (Date.now() - t0) / 1000
  const pagesRow = json(await sh(['ola-db', 'query', "SELECT method, confidence, lang FROM doc_pages WHERE doc_id = (SELECT id FROM documents WHERE path = 'dx/scan.pdf') ORDER BY page", '--json'])) ?? {}
  const scanHit = (await sh(['ola-db', 'search', '4.2 million dike repairs'])).out
  const scanQuote = await py(`
import sqlite3, sys
sys.path.insert(0, "/opt/ola/lib")
from olatext import find_quote
con = sqlite3.connect("file:/work/project.db?mode=ro", uri=True)
t = con.execute("SELECT text FROM doc_text WHERE doc_id = (SELECT id FROM documents WHERE path = 'dx/scan.pdf') AND page = 2").fetchone()[0]
print(find_quote("The Lowland Water Board set aside 4.2 million for dike repairs in 2019", t)[0])`)
  const rows = pagesRow.rows ?? []
  t('a PDF with no text layer is read by OCR inside the VM (Tesseract): both pages marked "ocr" with their confidence, the answer on page 2 quotable, and a search says the page was read from a scan',
    scan?.ocr_pages === 2 && rows.length === 2 && rows.every((r) => r[0] === 'ocr' && r[1] > 70) && scanQuote.out.trim() === 'True' && /scan\.pdf, page 2 \(file dx\/scan\.pdf; uploaded; read from a scan/.test(scanHit),
    `${measured.ocr_two_pages_s} s; ${JSON.stringify(rows)}`)
  const langs = (await sh(['tesseract', '--list-langs'])).out
  t('OCR languages in the image: English, Spanish, French, Portuguese, German, Russian, Arabic, Chinese (simplified and traditional), Hebrew, Norwegian, Filipino, and the script detector',
    ['eng', 'spa', 'fra', 'por', 'deu', 'rus', 'ara', 'chi_sim', 'chi_tra', 'heb', 'nor', 'fil', 'osd'].every((l) => new RegExp(`^${l}$`, 'm').test(langs)), langs.replace(/\n/g, ' ').slice(0, 200))

  // 3. Is this the right document?
  const right = await sh(['ola-db', 'check', 'dx/right-paper.pdf', '--cite', truth.paper?.cite ?? ''])
  const wrong = await sh(['ola-db', 'check', 'dx/wrong-paper.pdf', '--title', truth.paper?.title ?? '', '--doi', truth.paper?.doi ?? ''])
  const flagged = json(await sh(['ola-db', 'api', 'docs'])) ?? {}
  const wrongRow = flagged.documents?.find((d) => d.path === 'dx/wrong-paper.pdf')
  t('the right-document check: the expected paper matches by its citation (title, DOI, authors); another paper under that title and DOI is flagged as a mismatch, and the flag is in the Data tab’s list',
    right.code === 0 && json(right)?.result === 'match' && wrong.code === 6 && json(wrong)?.result === 'mismatch' && /another DOI/.test(json(wrong)?.detail ?? '') && wrongRow?.check_result === 'mismatch',
    `${json(right)?.detail} | ${json(wrong)?.detail}`)

  // 4. Charsets.
  for (const f of Object.keys(truth.charsets ?? {})) await sh(['ola-db', 'add', `dx/${f}`])
  const cs = await py(`
import json, sqlite3
truth = json.load(open("/work/dx/truth.json"))["charsets"]
con = sqlite3.connect("file:/work/project.db?mode=ro", uri=True)
ok = []
for f, want in truth.items():
    got = con.execute("SELECT t.text FROM doc_text t JOIN documents d ON d.id = t.doc_id WHERE d.path = ?", ("dx/" + f,)).fetchone()[0]
    ok.append([f, want in got])
print(json.dumps(ok))`)
  const csr = json(cs) ?? []
  t('charsets: Latin-1, Windows-1252 (no declaration), UTF-16 (no mark), Hebrew in Windows-1255 (declared in the page) and ISO-8859-8 (not declared) all read as written',
    csr.length === 5 && csr.every(([, ok]) => ok), JSON.stringify(csr))

  // 5. A library at once: zips refused or unpacked.
  const listing = async () => (await sh(['sh', '-c', 'ls -A /work | sort'])).out
  const before = await listing()
  const refusals = {}
  for (const z of ['bomb', 'liar', 'traversal', 'absolute', 'symlink', 'many']) {
    await sh(['cp', `/work/dx/${z}.zip`, `/work/${z}.zip`])
    const r = await sh(['ola-unzip', `${z}.zip`])
    refusals[z] = r.code === 3 ? last(r).replace(/^ola-unzip: /, '') : `exit ${r.code}`
    await sh(['rm', '-f', `/work/${z}.zip`])
  }
  const afterList = await listing()
  const leftInTmp = (await sh(['sh', '-c', 'ls -A /work/.ola/tmp 2>/dev/null | wc -l'])).out.trim()
  const escaped = (await sh(['sh', '-c', 'for f in /work/.ola/evil.txt /etc/evil.txt /work/secrets /work/ok.txt; do test -e "$f" && echo "$f"; done; true'])).out.trim()
  t('zips refused whole, nothing written: a bomb (1.5 GiB of zeros), one whose entry holds more than its header says, a path that climbs out, an absolute path, a symbolic link, 20,001 entries',
    Object.values(refusals).every((m) => !/^exit/.test(m)) && /bomb/.test(refusals.bomb) && /damaged|more than its header/.test(refusals.liar) && /leave the folder/.test(refusals.traversal) && /leave the folder/.test(refusals.absolute) && /link/.test(refusals.symlink) && /20001 entries/.test(refusals.many) && afterList === before && leftInTmp === '0' && escaped === '',
    `${JSON.stringify(refusals).slice(0, 300)}${escaped ? `; left: ${escaped}` : ''}`)
  // Killed partway (review 5 follow-up): a hard kill leaves its hidden half-unpacked folder and no
  // folder in the project; the next ola-unzip removes it (and ola-init at every start).
  await sh(['python3', '-c', 'import zipfile, os\nz = zipfile.ZipFile("/work/slow.zip", "w")\nfor i in range(300): z.writestr("slow/f%d.bin" % i, os.urandom(1 << 20))\nz.close()'])
  // Killed the moment its hidden folder holds a file: mid-unpack, whatever the machine's speed.
  const killed = (await sh(['sh', '-c', 'ola-unzip slow.zip >/dev/null 2>&1 & p=$!; for i in $(seq 1 400); do ls /work/.ola/tmp/unzip-*/f1.bin >/dev/null 2>&1 && break; sleep 0.01; done; kill -9 $p; wait $p 2>/dev/null; ls -A /work/.ola/tmp | grep -c "^unzip-"; test -e /work/slow && echo folder || echo none; rm -rf /work/slow.zip /work/slow'])).out.trim().split('\n')
  await sh(['cp', '/work/dx/papers.zip', '/work/papers.zip'])
  const unz = await sh(['ola-unzip', 'papers.zip'])
  const staleLeft = (await sh(['sh', '-c', 'ls -A /work/.ola/tmp 2>/dev/null | grep -c "^unzip-"; true'])).out.trim()
  t('a zip killed partway leaves no folder in the project, and its hidden half-unpacked folder is gone after the next ola-unzip', killed[0] === '1' && killed[1] === 'none' && staleLeft === '0', `after the kill: ${killed[0]} hidden, project folder ${killed[1]}; after the next: ${staleLeft}`)
  const u = json(unz) ?? {}
  const modes = (await sh(['sh', '-c', 'find /work/papers -type f -perm /111 | wc -l'])).out.trim()
  const folder = json(await sh(['ola-db', 'add-folder', 'papers', '--by', 'upload']))
  t('a library zip unpacks into its own folder: odd names made plain ("Résumé [draft]" → "Resume -draft-"), the Mac’s __MACOSX and dot files left out, a zip inside kept as a file, nothing executable; then every document is indexed',
    unz.code === 0 && u.folder === 'papers' && JSON.stringify(u.files?.map((f) => f.path).sort()) === JSON.stringify([...(truth.papers_zip?.files ?? [])].sort()) && u.skipped === 2 && u.renamed?.length === 1 && modes === '0' && folder?.indexed === 3,
    `${unz.code} ${last(unz)} ${JSON.stringify(u.files?.map((f) => f.path))} skipped ${u.skipped}; indexed ${folder?.indexed}`)

  // 6. A database the person brought.
  for (const b of ['library', 'corrupt', 'hostile', 'not-a-db']) await sh(['cp', `/work/dx/${b}.db`, `/work/${b}.db`])
  const lib = await sh(['ola-db', 'attach', 'library.db'])
  const bad = await sh(['ola-db', 'attach', 'corrupt.db'])
  const nod = await sh(['ola-db', 'attach', 'not-a-db.db'])
  const hos = await sh(['ola-db', 'attach', 'hostile.db'])
  const n = json(await sh(['ola-db', 'query', 'SELECT count(*) FROM library.papers', '--json']))?.rows?.[0]?.[0]
  const write = await sh(['ola-db', 'query', 'DELETE FROM library.papers'])
  const write2 = await sh(['ola-db', 'query', '--write', 'DELETE FROM library.papers'])
  const ext = await sh(['ola-db', 'query', 'SELECT * FROM hostile.v'])
  const tabs = json(await sh(['ola-db', 'api', 'tables'])) ?? {}
  const browse = json(await sh(['ola-db', 'api', 'browse', '--table', 'library.papers', '--sort', 'year', '--dir', 'desc', '--limit', '5'])) ?? {}
  t('an existing SQLite database is attached read-only after an integrity check: its 1,000 rows are tables in the Data tab (library.papers, browsable), it cannot be changed, a damaged file and a file that is not a database are refused, and a hostile one’s view cannot call load_extension',
    lib.code === 0 && n === 1000 && write.code === 3 && write2.code !== 0 && bad.code === 3 && /integrity/.test(last(bad)) && nod.code === 3 && hos.code === 0 && ext.code !== 0 && /unsafe use of load_extension/.test(last(ext)) &&
      tabs.tables?.some((x) => x.name === 'library.papers' && x.attached && x.rows === 1000) && browse.rows?.length === 5 && browse.total === 1000,
    `lib ${lib.code} n ${n} w ${write.code}/${write2.code} bad ${bad.code} nod ${nod.code} hos ${hos.code} ext ${ext.code} tab ${JSON.stringify(tabs.tables?.find((x) => x.name === 'library.papers'))?.slice(0, 120)} browse ${browse.rows?.length}/${browse.total} ${last(write2)}`)

  // 7. What Open shows, made here.
  const info = json(await sh(['ola-view', 'pdf-info', 'dx/scan.pdf'])) ?? {}
  const png = await sh(['ola-view', 'pdf-page', 'dx/two-column.pdf', '2', '--width', '1400'])
  const nl = png.bytes.indexOf(10)
  const head = nl > 0 ? JSON.parse(png.bytes.subarray(0, nl).toString()) : {}
  const hostilePdf = await sh(['ola-view', 'pdf-page', 'dx/hostile.pdf', '1'])
  t('a PDF opens as pictures of its pages made in the VM (a real PNG of page 2), with each page’s text and its scan mark; the PDF with JavaScript and a Launch action renders as a picture too, and nothing in it runs',
    info.pages === 2 && info.methods?.join() === 'ocr,ocr' && /4\.2\s+million/.test(info.texts?.[1] ?? '') && png.code === 0 && png.bytes[nl + 1] === 0x89 && png.bytes.subarray(nl + 2, nl + 5).toString('latin1') === 'PNG' && head.size === png.bytes.length - nl - 1 && hostilePdf.code === 0,
    `${info.pages} pages ${info.methods} 4.2: ${/4\.2 million/.test(info.texts?.[1] ?? '')} sig ${JSON.stringify(png.bytes.subarray(nl + 1, nl + 5).toString('latin1'))} len ${png.bytes.length - nl - 1}; png ${head.size} bytes; hostile ${hostilePdf.code} ${last(hostilePdf)}`)
  const docx = await sh(['ola-view', 'doc', 'dx/remote-template.docx'])
  const md = await sh(['ola-view', 'doc', 'dx/notes.md'])
  const live = (h) => /<(script|img|iframe|link|object|embed|form|meta http-equiv)\b|\b(href|src|srcset|action)\s*=/i.test(h.replace(/<meta charset="utf-8"><meta name="viewport"[^>]*>/, ''))
  t('a Word file with a remote template, a remote picture and an outside link, and a Markdown file with a script, renders to plain HTML: headings, lists and the table kept, and no script, link, picture or address that could load anything',
    docx.code === 0 && /<h1>Notes on the Drought Relief Hearing<\/h1>/.test(docx.out) && /<li>Farms first/.test(docx.out) && /<td>212<\/td>/.test(docx.out) && !live(docx.out) && !/template\.dotm|docx-picture|docx-field/.test(docx.out) &&
      md.code === 0 && /<h2>Decisions<\/h2>/.test(md.out) && /&lt;script&gt;/.test(md.out) && !live(md.out),
    `docx ${docx.out.length} bytes, md ${md.out.length} bytes`)
  const sheet = json(await sh(['ola-view', 'table', 'dx/formulas.xlsx'])) ?? {}
  const sorted = json(await sh(['ola-view', 'table', 'dx/formulas.xlsx', '--sheet', 'Districts', '--sort', 'Households', '--dir', 'desc'])) ?? {}
  const cells = JSON.stringify(sheet.rows ?? [])
  t('a spreadsheet with formulas, WEBSERVICE, HYPERLINK and an external workbook opens as rows: values as values, formulas as their text, never evaluated, its sheets as tabs, sorted on request',
    sheet.total === 7 && /=WEBSERVICE/.test(cells) && /=HYPERLINK/.test(cells) && /=SUM\(B2:B3\)/.test(cells) && JSON.stringify(sheet.sheets) === '["Budget","Districts"]' && sorted.rows?.[0]?.[0] === 'West',
    `${sheet.total} rows; ${JSON.stringify(sorted.rows?.[0])}`)

  // 8. Uploads in pieces, and the disk.
  const uid = 'ab'.repeat(16)
  const p1 = await sh(['ola-put', '--chunk', uid, '--offset', '0'], { input: Buffer.alloc(3000, 1) })
  const again = await sh(['ola-put', '--chunk', uid, '--offset', '0'], { input: Buffer.alloc(10, 2) })
  const p2 = await sh(['ola-put', '--chunk', uid, '--offset', '3000'], { input: Buffer.alloc(500, 3) })
  const fin = json(await sh(['ola-put', '--finish', uid, 'pieces.bin']))
  const { createHash } = await import('node:crypto')
  const want = createHash('sha256').update(Buffer.concat([Buffer.alloc(3000, 1), Buffer.alloc(500, 3)])).digest('hex')
  t('an upload in pieces: each piece must start where the last ended (a repeat is refused with what is there), and the finished file has the bytes sent, by sha256',
    json(p1)?.have === 3000 && again.code === 5 && json(again)?.have === 3000 && json(p2)?.have === 3500 && fin?.size === 3500 && fin?.sha256 === want, `${again.code} ${fin?.size}`)
  const d = json(await sh(['ola-db', 'api', 'disk'])) ?? {}
  t('the project’s disk, as Settings shows it: the volume, its use, and the room taken by files, data and Ola’s own records, with no file names',
    d.total > 0 && d.used > 0 && d.free > 0 && d.files > 1_000_000 && d.data > 0 && d.ola >= 0 && Object.keys(d).length === 6, JSON.stringify(d))
  await sh(['sh', '-c', 'rm -rf /work/dx /work/papers /work/library.db /work/corrupt.db /work/hostile.db /work/not-a-db.db /work/pieces.bin /work/papers.zip; ola-db init'])
}

// ---------------------------------------------------------------- alone
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const TAG = process.env.OLA_CHECK_TAG ?? ''
  process.env.OLA_HOME ??= path.join(homedir(), `.ola-check${TAG ? `-${TAG}` : ''}`)
  process.env.OLA_RUNNING_SCOPE = 'home'
  const ws = await import('./ws.mjs')
  const id = `${TAG ? `${TAG}-` : ''}chk-d`
  const results = []
  const t = (name, ok, detail = '') => {
    results.push(ok)
    console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  }
  const measured = {}
  try {
    await ws.destroy(id, { confirm: id }).catch(() => {})
    await ws.create(id, { cpus: 1, memory: '2g', disk: '8g' })
    await ws.start(id)
    await docChecks({ ws, id, t, measured })
  } catch (e) {
    t('the document checks ran', false, String(e?.message ?? e).slice(0, 300))
  } finally {
    await ws.destroy(id, { confirm: id }).catch(() => {})
  }
  console.log(JSON.stringify(measured))
  console.log(`${results.filter(Boolean).length} of ${results.length} passed`)
  process.exit(results.every(Boolean) ? 0 : 1)
}
