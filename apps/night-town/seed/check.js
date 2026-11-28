// The checks without a browser (a stand-in canvas that draws nothing). See TOWN.md, "How a change is judged".
//   node check.js [file with a check body]
const vm = require('vm'), fs = require('fs'), path = require('path')
const dir = __dirname
const fn = () => stub
const stub = new Proxy(function () {}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === Symbol.toPrimitive ? () => 0 : stub), set: () => true, apply: () => stub })
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : fn), set: (t, k, v) => { t[k] = v; return true } })
const canvas = { width: 960, height: 640, getContext: () => ctx, addEventListener() {}, style: {} }
function load() {
  const parts = fs.readdirSync(path.join(dir, 'parts')).filter((f) => f.endsWith('.js') && f !== 'index.js').sort()
  const win = { console, performance: { now: () => 0 }, requestAnimationFrame() {}, location: { search: '?test' }, Math, Date, setTimeout() {}, Image: function () { return { } } }
  win.window = win; win.document = { getElementById: () => canvas, createElement: () => canvas, addEventListener() {}, body: {} }; win.addEventListener = () => {}
  const c = vm.createContext(win)
  vm.runInContext(fs.readFileSync(path.join(dir, 'core.js'), 'utf8'), c, { filename: 'core.js' })
  for (const f of parts) vm.runInContext(fs.readFileSync(path.join(dir, 'parts', f), 'utf8'), c, { filename: 'parts/' + f, timeout: 5000 })
  vm.runInContext('town.start({ test: true })', c, { timeout: 10000 })
  return c
}
function check(body, name) {
  const c = load()
  c.__body = body
  let ok
  try { ok = vm.runInContext('(new Function("town", __body))(town)', c, { timeout: 20000 }) } catch (e) { console.log(`FAIL ${name}: threw ${e.message}`); return false }
  const errs = c.town.errors
  if (ok !== true) { console.log(`FAIL ${name}: returned ${JSON.stringify(ok)}`); return false }
  if (errs.length) { console.log(`FAIL ${name}: town.errors ${JSON.stringify(errs.slice(0, 3))}`); return false }
  console.log(`ok   ${name}`); return true
}
let good = true
try { const c = load(); vm.runInContext('town.advance(48); town.draw()', c, { timeout: 20000 }); if (c.town.errors.length) { good = false; console.log('FAIL two days: town.errors ' + JSON.stringify(c.town.errors.slice(0, 3))) } else console.log('ok   loads and runs two days') } catch (e) { good = false; console.log('FAIL loads and runs two days: ' + e.message) }
const kept = fs.existsSync(path.join(dir, 'checks.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'checks.json'), 'utf8')) : []
for (const k of kept) good = check(k.check, k.name) && good
if (process.argv[2]) good = check(fs.readFileSync(path.resolve(process.argv[2]), 'utf8'), 'this job') && good
process.exit(good ? 0 : 1)
