// Publish from the conversation (OLA-230). Bart, Nov 20: he asked Ola in chat to make a page "and
// publish it on ola", and Ola told him to go and press Publish somewhere else. Now the agent runs
// `ola-publish <folder> --files …` (workspace/ola-publish), opencode asks the person (always:
// web/server/publishask.mjs publishRules), and the answer comes here before it goes on to opencode:
//
//   - no                   passed on; the command never runs, nothing is published
//   - yes (once or always) the front desk publishes with the Publish button's own rules (sites.mjs
//                          prepare: the list, secrets, kinds of files, caps; the owner only; an
//                          address a Mac site holds stays its), "always" counting as once (a yes for
//                          one list is not a yes for the next), and hands the outcome to the
//                          waiting command in the VM (ws.mjs publishResult), which prints it for
//                          the agent, so Ola says the address in the conversation.
//
// Which list the yes is for: the page's sheet shows the list from the preview and sends its
// fingerprint; the Mac and iPhone apps show the command itself, whose --files must then be exactly
// the files that would go public (else nothing is published and the command says which files
// those are, so the agent can ask again with the right list).
import { publishAskOf, sameFiles } from '../web/server/publishask.mjs'

// How often, at most, what the address shows during the check is handed to the VM (OLA-285).
export const PROGRESS_MS = 15_000

export const OWNER_ONLY = 'Only the project’s owner can publish its pages. Nothing was published; ask the owner to say yes to it.'

/**
 * `deps`: { sites, siteCtx(ws), heldByPerson(slug), publishResult(slug, outcome), holdBusy(slug),
 *           audited(ws, sess, sel, plan, result, was), log }
 * Returns null when the permission is not a publish (the caller goes on as before), else
 * { decision, done } where `done` settles when the publish has finished (tests wait on it).
 */
export function makeChatPublish(deps) {
  const { sites, log = () => {} } = deps
  async function run(ws, sess, ask, fingerprint) {
    // A write the VM did not take is said in the log (OLA-421: a yes on the Mac app published nothing
    // and left no line, so the command's "no yes" was the only trace).
    const hand = async (outcome) => {
      const ok = await deps.publishResult(ws.slug, { target: ask.target, files: ask.files, ...outcome })
      if (!ok) log(`${ws.slug}: the publish outcome (${outcome.state}) did not reach the project`)
      return ok
    }
    const fail = (message) => (log(`${ws.slug}: a publish from the conversation was refused (${String(message).slice(0, 120)})`), hand({ state: 'failed', message }))
    if (ws.role !== 'owner') return fail(OWNER_ONLY)
    if (deps.heldByPerson(ws.slug)) return fail(`sites.ola.cx/${ws.slug}/ already holds a site someone published from their Mac, so this project’s pages cannot go there. Write to Ola’s team.`)
    if (!sites.configured()) return fail('Publishing to sites.ola.cx is not switched on yet on Ola’s server. The page is still in the project.')
    // "publishing" first, then the command may run (it waits for this outcome, and only this one).
    if (!(await hand({ state: 'publishing' }))) throw new Error('the project did not take the publishing note')
    return async () => {
      const release = deps.holdBusy?.(ws.slug) ?? (() => {})
      try {
        const ctx = deps.siteCtx(ws)
        // fresh: an old copy of the page (site/ from an earlier publish) is refused (OLA-267).
        const look = await sites.preview(ctx, ask.sel, { fresh: true })
        if (look.status !== 200) return fail(look.body?.message ?? 'The files could not be checked just now. Nothing was published.')
        const names = look.body.items.map((i) => i.as)
        if (!fingerprint && !sameFiles(ask.files, names)) return fail(`The files named are not the ones that would go public. Those are: ${names.join(', ')}. Nothing was published; ask the person again with exactly that list.`)
        const was = sites.status(ws.slug)
        // While Ola's server checks the address (up to five minutes for a git deploy, longer than the
        // command waits), what the address shows so far goes to the VM, so `ola-publish status` says
        // it, and never "live" before the check ends (OLA-285). One write at a time, at most one every
        // PROGRESS_MS, and none after the outcome.
        let chain = Promise.resolve()
        let lastAt = 0
        let over = false
        const onLook = (l) => {
          if (over || Date.now() - lastAt < (deps.progressMs ?? PROGRESS_MS)) return
          lastAt = Date.now()
          const note = { state: 'publishing', stage: 'checking', url: look.body.url, status: String(l.status ?? ''), shows: l.shows ?? '', challenged: !!l.challenged, until: Math.round(l.until / 1000) }
          chain = chain.then(() => (over ? null : hand(note))).catch(() => null)
        }
        const r = await sites.publish(ctx, ask.sel, fingerprint || look.body.fingerprint, { fresh: true, onLook })
        over = true
        await chain
        deps.audited?.(ws, sess, ask.sel, r, was)
        if (r.status !== 200) return fail(r.body?.message ?? 'The page could not be published just now. Nothing changed.')
        return hand({ state: 'done', url: r.body.url, count: r.body.files, live: r.body.live, again: r.body.again, shows: r.body.shows ?? '', expected: r.body.expected ?? '', ...(r.body.unconfirmed ? { unconfirmed: true } : {}), ...(r.body.message ? { message: r.body.message } : {}) })
      } finally {
        release()
      }
    }
  }
  // "Take it down" in the conversation: `ola-publish unpublish`, the same yes, the Unpublish button's work.
  async function takeDown(ws, sess) {
    const hand = (outcome) => deps.publishResult(ws.slug, { target: '(unpublish)', files: [], ...outcome })
    if (ws.role !== 'owner') return (await hand({ state: 'failed', message: 'Only the project’s owner can take its pages down. Nothing changed.' }), { decision: 'once', done: Promise.resolve() })
    const was = sites.status(ws.slug)
    if (!was) return (await hand({ state: 'failed', message: 'Nothing of this project is published, so there is nothing to take down.' }), { decision: 'once', done: Promise.resolve() })
    if (!(await hand({ state: 'publishing' }))) return { decision: 'reject', done: Promise.resolve() }
    const done = (async () => {
      const r = await sites.unpublish(ws.slug)
      deps.unaudited?.(ws, sess, was, r)
      if (r.status !== 200) return hand({ state: 'failed', message: r.body?.message ?? 'The pages could not be taken down just now. They are still public.' })
      return hand({ state: 'done', unpublished: true, url: r.body.url, live: r.body.gone !== false, ...(r.body.unconfirmed ? { unconfirmed: true } : {}), ...(r.body.message ? { message: r.body.message } : {}) })
    })().catch((e) => (log(`${ws.slug}: an unpublish from the conversation failed (${e?.message ?? e})`), hand({ state: 'failed', message: 'The pages could not be taken down just now. They are still public.' })))
    return { decision: 'once', done }
  }
  return {
    /** The person's answer to a permission request, before it goes on to opencode. */
    async onReply(ws, sess, sessionID, requestID, decision, body, ocAsk) {
      const list = await ocAsk('GET', `/api/session/${sessionID}/permission`)
      const all = Array.isArray(list.json) ? list.json : Array.isArray(list.json?.data) ? list.json.data : []
      const req = all.find((p) => p?.id === requestID) ?? null
      // Not among the pending asks: whatever it was, it goes on as before, but it is said (OLA-421).
      if (!req) log(`${ws.slug}: an answer to ask ${requestID} matched none of the ${all.length} pending (list ${list.status ?? '?'})`)
      const parsed = req ? publishAskOf(req.action, req.resources) : null
      if (!parsed || parsed.status) return null
      if (decision === 'reject' || !['once', 'always'].includes(decision)) return { decision, done: Promise.resolve() }
      // A command in a form we do not act on is answered no with the reason, never yes (OLA-421: a
      // yes let it run, and its "no yes from the person" told Ola the person had not said yes).
      if (parsed.bad) return (log(`${ws.slug}: a yes to a publish ask in a form we do not act on was answered no`), { decision: 'reject', message: `${parsed.statusBad ? 'Not run' : 'Not published, though the person said yes'}: ${parsed.bad}`, done: Promise.resolve() })
      if (parsed.unpublish) return takeDown(ws, sess)
      const ask = { sel: parsed.sel, files: parsed.files, target: parsed.sel.page ?? parsed.sel.folder }
      const fingerprint = typeof body?.fingerprint === 'string' && /^[0-9a-f]{64}$/.test(body.fingerprint) ? body.fingerprint : ''
      log(`${ws.slug}: a publish yes from the conversation (${ask.files.length} files, ${fingerprint ? 'with' : 'without'} the card's fingerprint)`)
      let later
      try {
        later = await run(ws, sess, ask, fingerprint)
      } catch (e) {
        log(`${ws.slug}: a publish from the conversation could not start (${e?.message ?? e})`)
        return { decision: 'reject', done: Promise.resolve() }
      }
      const done = typeof later === 'function' ? later().catch((e) => (log(`${ws.slug}: a publish from the conversation failed (${e?.message ?? e})`), deps.publishResult(ws.slug, { target: ask.target, files: ask.files, state: 'failed', message: 'The page could not be published just now. Nothing changed.' }))) : Promise.resolve()
      return { decision: 'once', done }
    },
  }
}
