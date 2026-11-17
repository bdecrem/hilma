// The front desk's hosted-model routes and the setting both fallbacks share (frontdesk/hosted.mjs),
// stood in for by dev.mjs, with the REAL opencode and gateway behind it: the stand-in keeps the
// setting in memory, writes the gateway's hosted grants file for the one dev caller (ws-dev), and
// runs one request exactly as the front desk does (switch the session to ola/hosted, prompt, watch
// opencode until the session stops executing, switch back, take a one-time grant back). The page
// follows the run on opencode's own event stream. The real path, in a sealed VM, is proven by
// frontdesk/check.mjs.
//
//   GET  /api/fallback            both fallbacks (the Claude stand-in's info too) and the stretch setting
//   POST /api/fallback/settings   { stretch, stretchTo }, owner only
//   POST /api/hosted/settings     { enabled, consent }, owner only
//   POST /api/hosted/run          { request, conversation, once }
//   POST /__dev/role?to=member    (OLA_DEV_CONTROLS=1) the signed-in person becomes a member, or the owner again
//   GET  /__dev/hosted            (OLA_DEV_CONTROLS=1) the grants file and the setting, for the checks
import fs from 'node:fs'

export function makeHostedStandin({ oc, grantsFile, provider, usage, claudeInfo, role }) {
  const st = { enabled: false, stretch: 'suggest', stretchTo: 'hosted', running: null, once: null, runs: 0 }
  const json = (res, status, body) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body))
  const read = async (req) => {
    let raw = ''
    for await (const c of req) raw += c
    try {
      return JSON.parse(raw || '{}')
    } catch {
      return null
    }
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const write = () => {
    const g = st.enabled ? { 'ws-dev': { cap_micro_usd: 20_000_000 } } : st.once ? { 'ws-dev': { cap_micro_usd: 20_000_000, until: st.once } } : {}
    fs.writeFileSync(`${grantsFile}.tmp`, JSON.stringify(g), { mode: 0o600 })
    fs.renameSync(`${grantsFile}.tmp`, grantsFile)
    return g
  }
  write()
  const info = async () => {
    const m = provider ? (await usage())?.data?.find((d) => d.caller === 'ws-dev')?.hosted_month : null
    return {
      enabled: st.enabled,
      canChange: role() === 'owner',
      configured: Boolean(provider),
      provider: provider || null,
      unavailable: provider ? null : 'This machine has no hosted open model set up yet. Bart can set one up.',
      month: { unit: 'usd', used: (m?.cost_micro_usd ?? 0) / 1e6, cap: 20, reported: true },
      running: st.running ? { conversation: st.running } : null,
    }
  }
  const granted = async () => Boolean((await usage())?.data?.find((d) => d.caller === 'ws-dev')?.hosted_month?.granted)

  async function run(body) {
    const once = !st.enabled && body.once === true
    if (!st.enabled && !once) return { status: 403, body: { error: 'hosted_off', message: 'The hosted open model is off for this project. Its owner can turn it on in Settings.' } }
    if (once && role() !== 'owner') return { status: 403, body: { error: 'owner_only', message: 'Only the project’s owner can hand a request to the hosted open model while it is off.' } }
    if (!provider) return { status: 503, body: { error: 'not_set_up' } }
    if (st.running) return { status: 409, body: { error: 'hosted_busy', message: 'The hosted open model is already working on a request in this project. Wait for it to finish, or stop it.' } }
    const session = body.conversation
    st.running = session
    if (once) st.once = Date.now() + 10 * 60_000
    write()
    for (let i = 0; i < 12 && !(await granted()); i++) await sleep(500)
    const back = async () => {
      await oc('POST', `/api/session/${session}/model`, { model: { id: 'general', providerID: 'ola' } })
      st.once = null
      st.running = null
      write()
    }
    const sw = await oc('POST', `/api/session/${session}/model`, { model: { id: 'hosted', providerID: 'ola' } })
    const p = sw.status < 300 ? await oc('POST', `/api/session/${session}/prompt`, { text: body.request }) : sw
    if (p.status >= 300) {
      await back()
      return { status: 502, body: { error: 'hosted_failed', message: 'The hosted open model could not start in your project just now. Nothing was changed.' } }
    }
    st.runs++
    // The end: opencode stops saying the session is executing (or never did, 20 s on).
    void (async () => {
      const t0 = Date.now()
      let seen = false
      for (;;) {
        await sleep(1000)
        const a = await oc('GET', '/api/session/active')
        const now = a.json?.data && typeof a.json.data === 'object' ? a.json.data[session]?.type === 'running' : null
        if (now) seen = true
        if ((seen && now === false) || (!seen && Date.now() - t0 > 20_000) || Date.now() - t0 > 10 * 60_000) break
        // A short run can end between two looks: the session's own end ("idle") after the prompt.
        if (!seen && now === false) {
          const m = await oc('GET', `/api/session/${session}/message?limit=200`)
          const list = Array.isArray(m.json?.data) ? m.json.data : Array.isArray(m.json) ? m.json : []
          if (list.some((x) => x?.type === 'idle' && Number(x.time?.created) >= t0 - 1000)) break
        }
      }
      await back()
    })()
    return { status: 200, body: { ok: true, run: `h${Date.now().toString(36)}`, provider } }
  }

  return async function handle(req, res, p, url) {
    if (p === '/api/fallback' && req.method === 'GET') {
      return json(res, 200, { claude: { ...claudeInfo(), canChange: role() === 'owner' }, hosted: await info(), stretch: st.stretch, stretchTo: st.stretchTo, canChange: role() === 'owner' }), true
    }
    if (p === '/__dev/hosted' && req.method === 'GET' && process.env.OLA_DEV_CONTROLS === '1') return json(res, 200, { grants: JSON.parse(fs.readFileSync(grantsFile, 'utf8')), enabled: st.enabled, runs: st.runs, running: st.running }), true
    if (!['/api/fallback/settings', '/api/hosted/settings', '/api/hosted/run'].includes(p) || req.method !== 'POST') return false
    const body = await read(req)
    if (!body) return json(res, 400, { error: 'bad_json' }), true
    if (p === '/api/hosted/run') {
      const r = await run(body)
      return json(res, r.status, r.body), true
    }
    if (role() !== 'owner') return json(res, 403, { error: 'owner_only', message: 'Only the project’s owner can change this.' }), true
    if (p === '/api/fallback/settings') {
      if (body.stretch !== undefined && !['suggest', 'handover', 'never'].includes(body.stretch)) return json(res, 400, { error: 'bad_stretch' }), true
      if (body.stretchTo !== undefined && !['hosted', 'claude'].includes(body.stretchTo)) return json(res, 400, { error: 'bad_stretch_to' }), true
      if (body.stretch) st.stretch = body.stretch
      if (body.stretchTo) st.stretchTo = body.stretchTo
      return json(res, 200, { stretch: st.stretch, stretchTo: st.stretchTo }), true
    }
    if (typeof body.enabled === 'boolean') {
      if (body.enabled && (body.consent !== true || !provider)) return json(res, 400, { error: 'consent', message: 'Read the note and confirm to turn this on.' }), true
      st.enabled = body.enabled
      write()
    }
    return json(res, 200, await info()), true
  }
}
