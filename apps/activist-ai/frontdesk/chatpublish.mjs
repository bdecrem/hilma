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
    const hand = (outcome) => deps.publishResult(ws.slug, { target: ask.target, files: ask.files, ...outcome })
    const fail = (message) => hand({ state: 'failed', message })
    if (ws.role !== 'owner') return fail(OWNER_ONLY)
    if (deps.heldByPerson(ws.slug)) return fail(`sites.ola.cx/${ws.slug}/ already holds a site someone published from their Mac, so this project’s pages cannot go there. Write to Ola’s team.`)
    if (!sites.configured()) return fail('Publishing to sites.ola.cx is not switched on yet on Ola’s server. The page is still in the project.')
    // "publishing" first, then the command may run (it waits for this outcome, and only this one).
    if (!(await hand({ state: 'publishing' }))) throw new Error('the project did not take the publishing note')
    return async () => {
      const release = deps.holdBusy?.(ws.slug) ?? (() => {})
      try {
        const ctx = deps.siteCtx(ws)
        const look = await sites.preview(ctx, ask.sel)
        if (look.status !== 200) return fail(look.body?.message ?? 'The files could not be checked just now. Nothing was published.')
        const names = look.body.items.map((i) => i.as)
        if (!fingerprint && !sameFiles(ask.files, names)) return fail(`The files named are not the ones that would go public. Those are: ${names.join(', ')}. Nothing was published; ask the person again with exactly that list.`)
        const was = sites.status(ws.slug)
        const r = await sites.publish(ctx, ask.sel, fingerprint || look.body.fingerprint)
        deps.audited?.(ws, sess, ask.sel, r, was)
        if (r.status !== 200) return fail(r.body?.message ?? 'The page could not be published just now. Nothing changed.')
        return hand({ state: 'done', url: r.body.url, count: r.body.files, live: r.body.live, again: r.body.again, ...(r.body.message ? { message: r.body.message } : {}) })
      } finally {
        release()
      }
    }
  }
  return {
    /** The person's answer to a permission request, before it goes on to opencode. */
    async onReply(ws, sess, sessionID, requestID, decision, body, ocAsk) {
      const list = await ocAsk('GET', `/api/session/${sessionID}/permission`)
      const all = Array.isArray(list.json) ? list.json : Array.isArray(list.json?.data) ? list.json.data : []
      const req = all.find((p) => p?.id === requestID) ?? null
      const parsed = req ? publishAskOf(req.action, req.resources) : null
      if (!parsed || parsed.status) return null
      if (decision === 'reject' || !['once', 'always'].includes(decision)) return { decision, done: Promise.resolve() }
      // A command in a form we do not act on runs and prints its own usage sentence; nothing is published.
      if (parsed.bad) return { decision: 'once', done: Promise.resolve() }
      const ask = { sel: parsed.sel, files: parsed.files, target: parsed.sel.page ?? parsed.sel.folder }
      const fingerprint = typeof body?.fingerprint === 'string' && /^[0-9a-f]{64}$/.test(body.fingerprint) ? body.fingerprint : ''
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
