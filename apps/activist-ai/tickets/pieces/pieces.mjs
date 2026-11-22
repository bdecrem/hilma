// The three trial tickets cut into pieces the way a strong planner would (OLA-370, Nov 21): each piece
// names the file, the function, the exact change and the check that says it is done, so a small model
// needs no searching. Written by Claude Opus 5.5 from the ticket, the base commit and the ticket's tests
// (and, a best case for the planner, with the real commit in view). trial.mjs --pieces runs them in
// order on one working tree; each piece's check files are given in .pieces/ (restored before each check).
//   case id -> [{ title, text, check: shell command run in the work folder, files: [check files] }]
export const PIECES = {
  'ola-351-ready': [
    {
      title: 'deployPending in _plate.mjs',
      files: [],
      check: 'node scripts/venture/runner-test.mjs',
      text: `In scripts/venture/_plate.mjs, add and export one new function. Put it directly above the doc comment that starts "/** pending: [{ id, priority }] ready tickets" (that comment sits right above \`export function deployGate\`; grep for "export function deployGate" to find the line).

Add this line and function:

const isDeployable = (i) => ['open', 'in_progress'].includes(i.status)

/** Ready tickets (rows are already filtered to those marked ready) whose server commits are not live. */
export function deployPending(rows, { hasCommit, hasServerFiles, isLive = () => false } = {}) {
  ...
}

Behavior of deployPending: rows is a list of { id, priority, status }. Keep only the rows for which isDeployable is true. For each kept row r: let c = hasCommit(r) (a commit hash string, possibly empty). Skip the row when c is empty, when hasServerFiles(r) is false, or when isLive(r, c) is true. Otherwise push { id: r.id, priority: r.priority, commit: c.slice(0, 8) }. Return the list in the rows' order.

Change nothing else in the file.`,
    },
    {
      title: 'runner.mjs deployFacts uses deployPending',
      files: [],
      check: `node --check scripts/venture/runner.mjs && grep -q 'deployPending(rows' scripts/venture/runner.mjs && ! grep -q "rows.filter((x) => x.status === 'in_progress')" scripts/venture/runner.mjs && grep -Eq "^import \\{.*deployPending.*\\} from './_plate.mjs'" scripts/venture/runner.mjs && node scripts/venture/runner-test.mjs`,
      text: `In scripts/venture/runner.mjs, two edits.

1. The import line near the top that starts "import { CHECKER_QUIET, CLAIM_PREFIX" and ends "from './_plate.mjs'": add deployPending to its list (after deployGate).

2. In the function deployFacts() (grep "async function deployFacts"), there is a block that starts with "const pending = []" and is followed by a loop "for (const r of rows.filter((x) => x.status === 'in_progress')) {" of about 8 lines that runs three git commands per row. Replace that whole block (from "const pending = []" to the loop's closing brace) with one call to deployPending (now exported by _plate.mjs), passing each of the loop's three git checks as a function:

  const pending = deployPending(rows, {
    hasCommit: (r) => <the loop's run('git', ['log', '-1', 'origin/main', ...]) call>.stdout.trim(),
    hasServerFiles: (r) => <the loop's run('git', ['log', 'origin/main', ..., '--name-only', ...]) call>.stdout.split('\\n').filter(Boolean).some(isServerFile),
    isLive: (r, c) => live ? <the loop's merge-base --is-ancestor call>.status === 0 : false,
  })

Copy each git command's arguments exactly from the loop. Change nothing else.`,
    },
  ],

  'ola-337-deepseek': [
    {
      title: 'hosted.mjs: PICKS and hostedConfig reads them',
      files: ['m1.mjs'],
      check: 'node .pieces/m1.mjs',
      text: `In apps/activist-ai/gateway/hosted.mjs (read lines 1 to 70 only), these edits:

1. HOSTED_SETTINGS (line ~24) becomes ['GATEWAY_HOSTED_FILE', 'GATEWAY_HOSTED_PRICES', 'HOSTED_DEEPSEEK_MODEL', 'HOSTED_DEEPSEEK_PRICES'].

2. Right below it add:
export const PICKS = {
  'deepseek-v4-pro': { name: 'DeepSeek V4 Pro', words: 'DeepSeek V4 Pro, an outside open model', model: 'HOSTED_DEEPSEEK_MODEL', prices: 'HOSTED_DEEPSEEK_PRICES' },
}

3. Add a helper next to it: const pricesOf = (text, setting, bad) => { ... } that does what the price loop inside hostedConfig does now (start from { in: 2, out: 2 }, split (text || 'in=2,out=2') on ',' then '=', call bad(\`\${setting} is in=,out= in dollars per million tokens\`) for a bad part, else set the number) and returns the prices. In hostedConfig replace the loop with const prices = pricesOf(env.GATEWAY_HOSTED_PRICES, 'GATEWAY_HOSTED_PRICES', bad).

4. In hostedConfig's first branch (when HOSTED_BASE_URL is not set), the list of settings checked with "is set but HOSTED_BASE_URL is not" also includes each PICKS entry's model setting: ['HOSTED_API_KEY', 'HOSTED_MODEL', 'HOSTED_PROVIDER', 'GATEWAY_HOSTED_FILE', ...Object.values(PICKS).map((p) => p.model)].

5. After the prices line, build const picks = new Map(). For each [name, p] of Object.entries(PICKS):
   - if env[p.model] is not set: if env[p.prices] is set, call bad(\`\${p.prices} is set but \${p.model} is not\`); then continue.
   - if env[p.model] does not match /^[A-Za-z0-9._:/-]{1,120}$/, call bad(\`\${p.model} is the provider’s model id\`).
   - if env[p.model] === model (the HOSTED_MODEL value read above), call bad(\`\${p.model} names the same model as HOSTED_MODEL: a picked choice is never the hosted default\`).
   - picks.set(name, { name, label: p.name, words: p.words, model: env[p.model], prices: pricesOf(env[p.prices], p.prices, bad) }).

6. Add picks to hostedConfig's returned object: { url, key, model, provider, file: env.GATEWAY_HOSTED_FILE, prices, picks }.

Change nothing else.`,
    },
    {
      title: 'hosted.mjs: makeHosted serves and records picks',
      files: ['m2.mjs'],
      check: 'node .pieces/m2.mjs',
      text: `In apps/activist-ai/gateway/hosted.mjs, function makeHosted (grep "export function makeHosted"; read from there about 70 lines). In the object it returns (the one with target, model: cfg.model, provider: cfg.provider, monthOf, refusal, record):

1. After provider: cfg.provider, add two members:
    picks: cfg.picks ?? new Map(),
    pickList: () => [...(cfg.picks ?? new Map()).values()].map((p) => ({ id: p.name, name: p.label, words: p.words })),

2. Change record(caller, tin, tout) to record(caller, tin, tout, pick = null). Inside, the cost uses the pick's prices when a pick is given: const prices = pick ? cfg.picks.get(pick).prices : cfg.prices, and cost = Math.round(tin * prices.in + tout * prices.out). Everything else in record stays (the early return 0, add.run, return cost).

Change nothing else.`,
    },
    {
      title: 'server.mjs loadConfig: a pick is never a rung of the ladder',
      files: [],
      check: `node --check apps/activist-ai/gateway/server.mjs && grep -q 'is a picked choice only, and' apps/activist-ai/gateway/server.mjs`,
      text: `In apps/activist-ai/gateway/server.mjs, function loadConfig (grep "const hosted = hostedConfig(env, bad)", around line 230). Directly after that line add a check that a picked model id is not also used by an everyday name, a backup or a specialist. In loadConfig, \`models\` is a Map of name -> upstream id, \`backups\` a Map of name -> upstream id, and \`sp.spec\` an object whose values have .upstreamId and .name (all three are defined above that line). Add:

  for (const p of hosted?.picks?.values() ?? []) {
    const also = [
      ...[...models].filter(([, id]) => id === p.model).map(([n]) => \`GATEWAY_MODELS \${n}\`),
      ...[...backups].filter(([, id]) => id === p.model).map(([n]) => \`GATEWAY_BACKUP_MODELS \${n}\`),
      ...Object.values(sp.spec).filter((x) => x.upstreamId === p.model).map((x) => \`the specialist \${x.name}\`),
    ]
    if (also.length) bad(\`\${p.label} (\${p.model}) is a picked choice only, and \${also.join(', ')} names it too\`)
  }

Change nothing else.`,
    },
    {
      title: 'server.mjs handle: serve a picked choice',
      files: [],
      check: `node --check apps/activist-ai/gateway/server.mjs && grep -q 'hosted.picks.has(body.model)' apps/activist-ai/gateway/server.mjs && grep -q 'hosted.record(who, tally.in, tally.out, pick)' apps/activist-ai/gateway/server.mjs`,
      text: `In apps/activist-ai/gateway/server.mjs, function handle (the chat request path). Six small edits; find each line with grep:

1. Replace the line \`const isHosted = body.model === 'hosted' && hosted !== null\` with:
  const pick = hosted !== null && typeof body.model === 'string' && hosted.picks.has(body.model) ? body.model : null
  const isHosted = (body.model === 'hosted' || pick !== null) && hosted !== null

2. In the "unknown model; this gateway serves:" message a few lines below, the list \`...(hosted ? ['hosted'] : [])\` becomes \`...(hosted ? ['hosted', ...hosted.picks.keys()] : [])\`.

3. After the line \`const s = isHosted ? { ...C.sp.spec.general, name: 'hosted', pool: 0, perMinute: 0 } : C.sp.spec[served]\` add: if (pick) rec.pick = pick

4. Right after the block that calls hosted.refusal(who, req) (the hosted grant check, ending with \`if (r) return no(r.status, r.why, r.message, r.type)\` and its closing brace), add:
  if (pick && laneOf(req)) return no(403, 'a picked choice in the batch lane', \`\${hosted.picks.get(pick).label} is used only for a request a person picks it for, not for a batch job.\`, 'permission_error')
(laneOf is already imported from ./batch.mjs.)

5. In \`const upstreamBody = { model: isHosted ? hosted.model : (probeBackup ?? C.models.get(served)), stream: false }\` the model becomes: pick ? hosted.picks.get(pick).model : isHosted ? hosted.model : (probeBackup ?? C.models.get(served))

6. \`rec.cost_micro_usd = hosted.record(who, tally.in, tally.out)\` becomes \`rec.cost_micro_usd = hosted.record(who, tally.in, tally.out, pick)\`.

Change nothing else.`,
    },
    {
      title: 'server.mjs: list the picks in /v1/models and /v1/usage',
      files: [],
      check: `cd apps/activist-ai/gateway && node --test --test-name-pattern='picked choice' test.mjs`,
      text: `In apps/activist-ai/gateway/server.mjs, function handle, two routes (grep each):

1. /v1/usage (grep "rec.route === 'usage'"): two send(...) lines.
   - In the first one (who === 'usage'), \`hosted: hosted ? { provider: hosted.provider, prices: C.hosted.prices } : null\` becomes \`hosted: hosted ? { provider: hosted.provider, prices: C.hosted.prices, picks: hosted.pickList() } : null\`.
   - In the second one (a caller's own), \`hosted: { provider: hosted.provider }\` becomes \`hosted: { provider: hosted.provider, picks: hosted.pickList() }\`.

2. /v1/models: the last \`return send(res, 200, { object: 'list', data: [...\` line (the one for an ordinary caller, with owned_by: 'ola'). Its tail \`...(hosted ? [{ id: 'hosted', object: 'model', owned_by: 'ola', kind: 'chat', images: false }] : [])\` becomes
   ...(hosted ? [{ id: 'hosted', object: 'model', owned_by: 'ola', kind: 'chat', images: false }, ...hosted.pickList().map((p) => ({ id: p.id, object: 'model', owned_by: 'outside', kind: 'chat', images: false, picked: true, name: p.name }))] : [])
   Do not add picks to the other /v1/models list (the usage token's, with upstream ids): a pick is not listed there.

Change nothing else. The check runs the gateway's test for picked choices (about a minute).`,
    },
  ],

  'ola-283-select': [
    {
      title: 'select.mjs: the tables, unchecked, treeFiles, lanes',
      files: ['h1.mjs'],
      check: 'node .pieces/h1.mjs',
      text: `Create the new file apps/activist-ai/ops/select.mjs (an ES module; imports: import { existsSync, readFileSync, readdirSync } from 'node:fs' and import path from 'node:path'). Start it with a short comment: "Which suites an update runs, and side by side how (OLA-283)." Put in exactly these exports and functions:

export const ALWAYS = ['turn', 'backup', 'ci', 'signers', 'restart', 'asks', 'select']
export const ENTRY = { turn: 'ops/turn-test.mjs', backup: 'ops/backup-test.mjs', ci: 'ops/ci-test.mjs', signers: 'ops/signers-test.mjs', restart: 'ops/restart-test.mjs', asks: 'evals/asks/test.mjs', select: 'ops/select-test.mjs', gateway: 'gateway/test.mjs', workspace: 'workspace/check.mjs', web: 'web/check.mjs', frontdesk: 'frontdesk/check.mjs', tls: 'ops/tls-test.mjs', apps: 'apple/OlaKit/Package.swift' }
export const OWNS = {
  gateway: ['gateway/'],
  workspace: ['workspace/', 'skills/', 'spike/'],
  web: ['web/'],
  frontdesk: ['frontdesk/', 'web/src/', 'web/public/', 'web/index.html', 'web/vite.config.ts', 'web/tsconfig.json', 'web/package.json', 'web/package-lock.json', 'web/scripts/', 'web/server/', 'workspace/', 'skills/'],
  apps: ['apple/', 'workspace/', 'skills/', 'web/test/fixtures/', 'web/src/lib/'],
}
export const LANES = [['workspace', 'frontdesk'], ['web'], ['gateway'], ['tls'], ['apps'], ['turn', 'backup', 'ci', 'signers', 'restart', 'asks', 'select']]
export const ALL_IF = ['package.json', 'package-lock.json']
const UNCHECKED = [/\\.md$/, /^evals\\//, /^site\\//, /^brand\\//, /^bart\\//, /^opencode-fork\\//, /(^|\\/)\\.gitignore$/, /^apple\\//, /^ops\\/(watch|watch-test|clean-test|studio|studio-test|cert|dns|probe|tunnel)\\.mjs$/, /^ops\\/studio\\//, /^ops\\/ngrok\\.yml$/]
const READ_MD = [/^workspace\\//, /^skills\\//]
export const unchecked = (f) => UNCHECKED.some((r) => r.test(f)) && !READ_MD.some((r) => r.test(f))
export const PARTS = {
  'README.md': (t) => /\\*\\*The standing instruction\\*\\*[\\s\\S]*?\`\`\`text\\n([\\s\\S]*?)\\n\`\`\`/.exec(t)?.[1] ?? null,
}

/** Every file under root (relative paths with '/', sorted), skipping node_modules, dist, .build and any name starting with a dot. */
export function treeFiles(root): walk the folders recursively from root with readdirSync(..., { withFileTypes: true }); skip an entry named node_modules, dist or .build or starting with '.'; recurse into folders; collect files as relative paths ('a/b.mjs'); return them sorted.

/** The lanes for the suites to run. */
export function lanes(run): const out = LANES.map((l) => l.filter((s) => run.includes(s))).filter((l) => l.length); then every suite of run in no lane gets a lane of its own ([s]) at the end; return out.

Nothing else yet (later pieces add suiteFiles, toolFiles and plan to this file). Do not change other files.`,
    },
    {
      title: 'select.mjs: suiteFiles, a suite\'s files',
      files: ['h2.mjs'],
      check: 'node .pieces/h2.mjs',
      text: `In apps/activist-ai/ops/select.mjs (made by the previous piece; read it whole, it is short), add these constants and one exported function, suiteFiles. Constants (put them above treeFiles):

const FOLDER_SKIP = [/^evals\\/asks\\//]
const SPEC = /(?:\\bfrom\\s*|\\bimport\\s*\\(\\s*|\\bimport\\s+)(['"])([^'"\\n]+)\\1/g
const LIT = /(['"\`])([A-Za-z0-9_.@/-]{2,160})\\1/g
const JOIN = /(?:join|resolve|PathComponent|URL)\\(([^()]*)\\)/g
const CODE = /\\.(m?js|cjs|ts|tsx|mts|py|sh|swift)$|(^|\\/)(ola-[a-z-]+|Containerfile)$/

export function suiteFiles(root, entry, files) returns the sorted list of files a suite uses: the closure of entry inside files (the sorted relative paths from treeFiles(root)), or null when entry does not exist (existsSync(path.join(root, entry))) or a code file it reaches cannot be read.

Setup: set = new Set(files); dirs = every parent folder of every file (path.dirname repeatedly, stopping at '.'); byBase = Map from path.basename(f) to the list of files with that base name; under(d) = files starting with d + '/'. seen = new Set(), leaves = new Set(), todo = [entry]. add(f) pushes f on todo unless seen. leaf(f) adds f to leaves (counted, not followed).

resolve(from, spec, { bare = true } = {}) returns hits (files to follow):
  tryOne(p): n = path.normalize(p); return if n starts with '..' or is '.' or ''. For c in [n, n+'.ts', n+'.tsx', n+'.mjs', n+'.js', n+'/index.ts', n+'/index.mjs']: if set.has(c), push c to hits and return. Else if dirs.has(n) and (bare or spec includes '/'): every file of under(n) except ones whose basename is README.md and ones matching FOLDER_SKIP goes to leaf().
  Call tryOne(path.join(path.dirname(from), spec)) and then tryOne(spec).
  If there are no hits, spec has no '/', and spec ends in a file extension (/\\.[a-z0-9]+$/i): all = byBase.get(spec) ?? []; near = the ones whose folder is from's folder or from's parent folder; if near is non-empty, hits.push(...near); else if all has exactly one, hits.push(it); else every one of all goes to leaf().
  Return hits.

Main loop: while todo is not empty: rel = todo.pop(); skip if seen; seen.add(rel); if !CODE.test(rel) continue (non-code files are counted but not read); read the text (readFileSync utf8; on error return null). Then:
  a) For each match m of text.matchAll(SPEC), spec = m[2]: skip if it starts with 'node:'. If it starts with '.', resolve(rel, spec).forEach(add). Otherwise it is a package: walk dir = path.dirname(rel) upward (path.dirname) while dir !== '.' and !set.has(path.join(dir, 'package-lock.json')); then add path.normalize(path.join(dir, 'package-lock.json')) and path.normalize(path.join(dir, 'package.json')) for each that is in set.
  b) joined = a Set of every LIT literal (m[2]) found inside the arguments of a JOIN match (for c of text.matchAll(JOIN), for m of c[1].matchAll(LIT)).
  c) For each match m of text.matchAll(LIT): s = m[2] with a leading './' removed; skip s that is '..' or '.' or starts with http:, https: or node:. resolve(rel, s, { bare: joined.has(m[2]) }).forEach(add). Also tail = s with every leading '../' removed: if tail !== s and tail is non-empty, resolve(rel, tail, { bare: true }).forEach(add).

Return [...new Set([...seen, ...leaves])].sort().

Do not change other files.`,
    },
    {
      title: 'select.mjs: toolFiles, the update tool\'s own files',
      files: ['h3.mjs'],
      check: 'node .pieces/h3.mjs',
      text: `In apps/activist-ai/ops/select.mjs add one exported function:

/** The update tool's own files: ops/ola.mjs and the files it imports, followed. */
export function toolFiles(root): seen = new Set(), todo = ['ops/ola.mjs']. While todo is not empty: rel = todo.pop(); skip it if seen or if it does not exist (existsSync(path.join(root, rel))); seen.add(rel); for each match m of readFileSync(path.join(root, rel), 'utf8').matchAll(SPEC) (SPEC is the import regex already in the file) whose m[2] starts with '.', push path.normalize(path.join(path.dirname(rel), m[2])). Return [...new Set([...seen, 'ops/select.mjs'])].filter((f) => f.startsWith('ops/')).sort().

Do not change other files.`,
    },
    {
      title: 'select.mjs: plan and changedFiles',
      files: [],
      check: 'node --test apps/activist-ai/ops/select-test.mjs',
      text: `In apps/activist-ai/ops/select.mjs add two exported functions. The ticket's test apps/activist-ai/ops/select-test.mjs must pass (do not change it).

export function plan({ root, changed, suites, before = () => null }) returns { run, skip, all, why }:
  everything(why) = { run: [...suites], skip: [], all: why, why: Object.fromEntries(suites.map((s) => [s, why])) }.
  1. if !changed: return everything('no passed commit to compare with').
  2. unknown = suites without an ENTRY; if any: return everything(\`the selection does not know suite \${unknown.join(', ')}\`).
  3. tool = new Set(toolFiles(root)); top = changed files in ALL_IF or in tool; if any: return everything(\`the change touches the update tool or the top packages (\${top.join(', ')})\`).
  4. files = treeFiles(root). For each suite s: c = suiteFiles(root, ENTRY[s], files); if !c return everything(\`\${s}'s entry \${ENTRY[s]} or a file it names cannot be read\`); uses[s] = { closure: new Set(c), owns: OWNS[s] ?? [] }.
  5. owned(s, f) = !unchecked(f) && uses[s].owns.some((p) => p.endsWith('/') ? f.startsWith(p) : f === p); touches(s, f) = uses[s].closure.has(f) || owned(s, f).
  6. why = {}, unplaced = [], same = []. For each f of changed: if PARTS[f]: read now = the file's text at root (null on error), was = before(f); part = now === null ? null : PARTS[f](now); if part !== null and was !== null and part === PARTS[f](was): same.push(f) and continue to the next file. Then by = suites that touch f; for each s of by: why[s] ??= \`the change touches \${f}\`; if by is empty and !unchecked(f): unplaced.push(f).
  7. if unplaced is non-empty: return everything(\`no suite is known to use \${unplaced.slice(0, 3).join(', ')}\${unplaced.length > 3 ? \` and \${unplaced.length - 3} more\` : ''}, so every suite runs\`).
  8. run = [], skip = []. For each s of suites in order: if ALWAYS includes s: run.push(s) and why[s] ??= 'seconds, runs every time'; else if why[s]: run.push(s); else skip.push({ name: s, why: \`the change touches none of its \${uses[s].closure.size} files\${uses[s].owns.length ? \` or \${uses[s].owns.join(' ')}\` : ''}\${same.length ? \` (\${same.join(', ')}: changed outside the part checks read)\` : ''}\` }).
  9. return { run, skip, all: null, why }.

/** git diff --name-only base commit -- apps/activist-ai, relative to apps/activist-ai; null on failure. */
export function changedFiles(git, base, commit): if !base return null; r = git('diff', '--name-only', '--no-renames', base, commit, '--', 'apps/activist-ai'); if r.status !== 0 return null; return r.stdout split on '\\n', empty lines dropped, each with a leading 'apps/activist-ai/' removed.

Then run: node --test apps/activist-ai/ops/select-test.mjs. Do not change other files.`,
    },
  ],
}
