// Round two: one eval run inside a sealed workspace VM (workspace/ws.mjs), so the agent sees what a
// customer's run sees: no network but the door to our gateway, the image's tools only, 4 CPUs, 6 GB.
//
// Per run: create the workspace (a slot id such as ev-g1, destroyed and made again every run), start
// it, put the generated inputs into /work (tar through `container exec`, since the desk's upload
// takes flat names and some tasks have folders), open a session with opencode through the desk's
// socket and send the prompts one after another in that session (follow-up tasks have two), stop at
// the time or token limit by interrupting the session, copy /work back out (without .ola, the
// agent's own history), destroy the workspace. Tokens and requests come from the gateway's usage
// database for that slot's caller (each slot runs one run at a time), not from the agent's events.
import { spawnSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const here = path.dirname(fileURLToPath(import.meta.url))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function makeWsHarness({ home, gatewayDb }) {
  process.env.OLA_HOME = home
  process.env.OLA_GATEWAY_DOORS = path.join(home, 'gw')
  const ws = await import(path.join(here, '../../workspace/ws.mjs'))
  const { OpenCode } = await import('@opencode/client')
  const gdb = new DatabaseSync(gatewayDb, { readOnly: true })
  const usageQ = gdb.prepare('SELECT coalesce(sum(tokens_in),0) AS ti, coalesce(sum(tokens_out),0) AS tout, coalesce(sum(requests),0) AS rq FROM usage WHERE caller = ?')
  const usage = (caller) => usageQ.get(caller)

  async function destroyQuietly(id) {
    if (ws.inspect(id) || ws.volumeOf(id) || existsSync(ws.paths(id).dir)) {
      try { await ws.destroy(id, { confirm: id }) } catch (e) { return String(e.message || e).slice(0, 200) }
    }
    return null
  }

  async function run({ slot, gen, work, dir, prompts, timeLimit, tokenLimit, live }) {
    const id = slot
    const caller = ws.names(id).caller
    const s = { final_text: '', all_text: '', requests: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0, tools: {}, errors: 0, end_reason: 'done', turns: 0 }
    const left = await destroyQuietly(id)
    if (left) throw new Error(`slot ${id} not clean: ${left}`)
    let bridge = null
    try {
      await ws.create(id, { cpus: 4, memory: '6g', disk: '8g' })
      await ws.start(id)
      const ctrName = ws.names(id).container
      const tar = spawnSync('/usr/bin/tar', ['-cf', '-', '--no-mac-metadata', '--no-xattrs', '--format', 'ustar', '-C', gen, '.'], { maxBuffer: 1 << 30, env: { ...process.env, COPYFILE_DISABLE: '1' } })
      if (tar.status !== 0) throw new Error('tar of inputs failed')
      const put = spawnSync(ws.CONTAINER, ['exec', '-i', ctrName, 'tar', '-xf', '-', '-C', '/work', '--no-same-owner', '--no-same-permissions'], { input: tar.stdout, maxBuffer: 1 << 24 })
      if (put.status !== 0) throw new Error('inputs did not reach the workspace: ' + String(put.stderr).slice(-200))
      bridge = net.createServer((c) => {
        const u = net.connect(ws.paths(id).opencode)
        c.pipe(u).pipe(c)
        c.on('error', () => u.destroy())
        u.on('error', () => c.destroy())
      })
      await new Promise((r) => bridge.listen(0, '127.0.0.1', r))
      const auth = `Basic ${Buffer.from(`opencode:${ws.secrets(id).OPENCODE_PASSWORD}`).toString('base64')}`
      const client = OpenCode.make({ baseUrl: `http://127.0.0.1:${bridge.address().port}`, headers: { authorization: auth } })
      const u0 = usage(caller)
      let sid = null
      let turn = 0
      const names = new Map()
      const texts = [] // { turn, msg, text }
      let stopEvents = false
      const evlog = createWriteStream(path.join(dir, 'events.jsonl'))
      s.forms = 0
      // A question to the user (opencode's form) ends nothing here: there is no user. Its text counts as
      // something the agent said to the user, and the form is cancelled with a fixed note so the run goes
      // on the way an unattended run would. A permission prompt is rejected (the config allows all but
      // the web and outside folders, so none is expected).
      const AWAY = 'The user is away and cannot answer questions during this task. Carry on with your best judgment, and say in your final message what you assumed.'
      ;(async () => {
        try {
          for await (const ev of client.event.subscribe()) {
            if (stopEvents) break
            const d = ev.data || {}
            if (ev.type === 'form.created' && d.form?.sessionID === sid) {
              s.forms++
              const q = [d.form.title, JSON.stringify(d.form.fields)].join('\n').slice(0, 4000)
              texts.push({ turn, at: Date.now(), msg: 'form', text: q })
              evlog.write(JSON.stringify({ t: Date.now(), type: ev.type, title: String(d.form.title).slice(0, 300) }) + '\n')
              client.session.form.cancel({ sessionID: sid, formID: d.form.id, message: AWAY }).catch((e) => evlog.write(JSON.stringify({ type: 'form.cancel.error', e: String(e?.message || e).slice(0, 200) }) + '\n'))
              continue
            }
            if (ev.type === 'permission.asked' && d.sessionID === sid) {
              evlog.write(JSON.stringify({ t: Date.now(), type: ev.type, action: d.action }) + '\n')
              client.permission.reply({ sessionID: sid, requestID: d.id, decision: 'reject' }).catch(() => {})
              continue
            }
            if (!sid || d.sessionID !== sid) continue
            evlog.write(JSON.stringify({ t: Date.now(), type: ev.type, ...(ev.type.startsWith('session.tool') && d.name ? { name: d.name } : {}) }) + '\n')
            if (ev.type === 'session.tool.input.started' && typeof d.name === 'string') names.set(d.id, d.name)
            else if (ev.type === 'session.tool.called') (s.tools[names.get(d.id) || '?'] ||= { calls: 0, errors: 0 }).calls++
            else if (ev.type === 'session.tool.failed') { const t = (s.tools[names.get(d.id) || '?'] ||= { calls: 0, errors: 0 }); t.errors++; s.errors++ }
            else if (ev.type === 'session.text.ended' && d.text) texts.push({ turn, at: Date.now(), msg: d.assistantMessageID, text: d.text })
            else if (ev.type === 'session.execution.failed') s.saw_error = true
          }
        } catch {}
      })()
      const session = await client.session.create({ location: { directory: '/work' } })
      sid = session.id
      const t0 = Date.now()
      let lastPromptAt = 0
      for (const text of prompts) {
        lastPromptAt = Date.now()
        await client.session.prompt({ sessionID: sid, text })
        s.turns++
        let watching = true
        const watchTokens = (async () => {
          while (watching) {
            await sleep(3000)
            const u = usage(caller)
            if (u.ti + u.tout - u0.ti - u0.tout > tokenLimit) return 'token_limit'
            if (Date.now() - t0 > timeLimit * 1000) return 'timeout'
            if (live.stopping) return 'stopping'
          }
          return 'done'
        })()
        // session.wait is a long poll; the HTTP client gives up on it after 5 minutes, so it is retried
        const waitLoop = (async () => {
          for (;;) {
            try { await client.session.wait({ sessionID: sid }); return 'done' } catch (e) {
              const m = String(e?.message || e)
              if (!/fetch failed|Transport|timeout|socket/i.test(m) || !watching) return 'wait_error:' + m.slice(0, 80)
              await sleep(1000)
            }
          }
        })()
        const r = await Promise.race([waitLoop, watchTokens])
        watching = false
        if (r !== 'done') {
          s.end_reason = r.startsWith('wait_error') ? 'harness_error' : r === 'stopping' ? 'harness_error' : r
          if (r.startsWith('wait_error')) s.why = r
          await client.session.interrupt({ sessionID: sid }).catch(() => {})
          break
        }
        turn++
      }
      await sleep(1500) // the last text events
      stopEvents = true
      evlog.end()
      // the final message: the last assistant message after the last prompt (by time: a text's event can
      // arrive just after the wait for its turn returns)
      const mine = texts.filter((t) => t.at >= lastPromptAt && t.msg !== 'form')
      const lastMsg = mine.length ? mine[mine.length - 1].msg : null
      s.final_text = mine.filter((t) => t.msg === lastMsg).map((t) => t.text).join('\n')
      s.all_text = texts.map((t) => t.text).join('\n\n')
      const u1 = usage(caller)
      s.tokens_in = u1.ti - u0.ti
      s.tokens_out = u1.tout - u0.tout
      s.requests = u1.rq - u0.rq
      if (s.end_reason === 'done' && s.saw_error && !s.final_text) s.end_reason = 'model_error'
      // the outputs, without the agent's own history
      mkdirSync(work, { recursive: true })
      const q = (x) => `'${String(x).replace(/'/g, "'\\''")}'`
      const out = spawnSync('/bin/sh', ['-c', `${q(ws.CONTAINER)} exec ${q(ctrName)} tar -cf - -C /work --exclude=./.ola . | /usr/bin/tar -xf - -C ${q(work)}`], { encoding: 'utf8', maxBuffer: 1 << 24 })
      if (out.status !== 0) s.why = (s.why || '') + ' outputs: ' + String(out.stderr).slice(-160)
    } finally {
      if (bridge) bridge.close()
      const left2 = await destroyQuietly(id)
      if (left2) s.why = (s.why || '') + ' destroy: ' + left2
    }
    return s
  }
  return { run, destroyQuietly, ws }
}
