// Publish from the conversation (OLA-230, chatpublish.mjs): the person's answer to `ola-publish`
// becomes a publish with the Publish button's own rules, and the outcome goes to the waiting
// command. Stand-ins for opencode's pending list, the sites module and the VM's outcome file.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeChatPublish, OWNER_ONLY } from '../chatpublish.mjs'

const FP = 'a'.repeat(64)
const ITEMS = [{ as: 'index.html', path: 'site/index.html', size: 10, uploaded: false }, { as: 'style.css', path: 'site/style.css', size: 5, uploaded: false }]

function setup({ command = 'ola-publish site --files index.html,style.css', action = 'shell', configured = true, held = false, preview = { status: 200, body: { items: ITEMS, fingerprint: FP, url: 'https://sites.ola.cx/tenants/' } }, publish } = {}) {
  const outcomes = []
  const calls = { preview: [], publish: [], audited: 0, busy: 0 }
  const sites = {
    configured: () => configured,
    status: () => null,
    async preview(ctx, sel) {
      calls.preview.push(sel)
      return preview
    },
    async publish(ctx, sel, fingerprint) {
      calls.publish.push({ sel, fingerprint })
      return publish ?? (fingerprint === FP ? { status: 200, body: { url: 'https://sites.ola.cx/tenants/', files: 2, live: true, again: false, total: 15, fingerprint: FP } } : { status: 409, body: { error: 'changed', message: 'The files changed since you looked.' } })
    },
  }
  const cp = makeChatPublish({
    sites,
    siteCtx: () => ({}),
    heldByPerson: () => held,
    publishResult: async (slug, o) => (outcomes.push(o), true),
    holdBusy: () => (calls.busy++, () => calls.busy--),
    audited: () => calls.audited++,
  })
  const pending = { json: [{ id: 'per_1', action, resources: [command] }] }
  const oc = async (m, p) => (m === 'GET' && p === '/api/session/ses_1/permission' ? pending : { status: 200 })
  const answer = (decision, body = {}, role = 'owner') => cp.onReply({ slug: 'tenants', id: 1, role }, { personId: 7 }, 'ses_1', 'per_1', decision, body, oc)
  return { answer, outcomes, calls }
}

test('a command that is not ola-publish is not ours: null, the usual path goes on', async () => {
  const { answer } = setup({ command: 'ls site' })
  assert.equal(await answer('once'), null)
  assert.equal(await setup({ command: 'ola-publish status' }).answer('once'), null)
  assert.equal(await setup({ command: 'ola-publish site --files a', action: 'edit' }).answer('once'), null)
})

test('the page’s yes with the fingerprint of the list it showed: publishing noted first, then published exactly that, the address handed back', async () => {
  const { answer, outcomes, calls } = setup()
  const r = await answer('once', { fingerprint: FP })
  assert.equal(r.decision, 'once')
  assert.deepEqual(outcomes[0], { target: 'site', files: ['index.html', 'style.css'], state: 'publishing' })
  await r.done
  assert.deepEqual(calls.publish, [{ sel: { folder: 'site' }, fingerprint: FP }])
  assert.equal(outcomes.at(-1).state, 'done')
  assert.equal(outcomes.at(-1).url, 'https://sites.ola.cx/tenants/')
  assert.deepEqual(outcomes.at(-1).files, ['index.html', 'style.css'], 'the list stays the list the command waits for')
  assert.equal(outcomes.at(-1).count, 2)
  assert.equal(calls.audited, 1)
  assert.equal(calls.busy, 0, 'the project is held busy only while it publishes')
})

test('no: passed on as no, nothing checked, nothing published, nothing handed to the command', async () => {
  const { answer, outcomes, calls } = setup()
  const r = await answer('reject', { message: 'not now' })
  assert.equal(r.decision, 'reject')
  await r.done
  assert.equal(calls.preview.length + calls.publish.length + outcomes.length, 0)
})

test('"yes, for the rest of this conversation" counts as once (a yes for one list is not a yes for the next)', async () => {
  const { answer, calls } = setup()
  const r = await answer('always')
  assert.equal(r.decision, 'once')
  await r.done
  assert.equal(calls.publish.length, 1)
})

test('the apps’ yes (no fingerprint): published only when --files is exactly what would go public, in any order', async () => {
  const ok = setup({ command: 'ola-publish site --files style.css,index.html' })
  await (await ok.answer('once')).done
  assert.deepEqual(ok.calls.publish, [{ sel: { folder: 'site' }, fingerprint: FP }])
  assert.equal(ok.outcomes.at(-1).state, 'done')
  const wrong = setup({ command: 'ola-publish site --files index.html' })
  await (await wrong.answer('once')).done
  assert.equal(wrong.calls.publish.length, 0)
  assert.equal(wrong.outcomes.at(-1).state, 'failed')
  assert.match(wrong.outcomes.at(-1).message, /Those are: index.html, style.css/)
})

test('a member’s yes: not published, the command is told only the owner can', async () => {
  const { answer, outcomes, calls } = setup()
  const r = await answer('once', { fingerprint: FP }, 'member')
  assert.equal(r.decision, 'once')
  await r.done
  assert.equal(calls.publish.length, 0)
  assert.deepEqual(outcomes, [{ target: 'site', files: ['index.html', 'style.css'], state: 'failed', message: OWNER_ONLY }])
})

test('the checks refuse (a key in a page): the refusal’s own sentence goes to the command, nothing published', async () => {
  const { answer, outcomes, calls } = setup({ preview: { status: 422, body: { error: 'secret', message: 'Ola will not publish this: site/app.js holds a key.' } } })
  await (await answer('once', { fingerprint: FP })).done
  assert.equal(calls.publish.length, 0)
  assert.equal(outcomes.at(-1).state, 'failed')
  assert.match(outcomes.at(-1).message, /holds a key/)
})

test('the files changed after the sheet showed them: the stale fingerprint publishes nothing', async () => {
  const { answer, outcomes } = setup()
  await (await answer('once', { fingerprint: 'b'.repeat(64) })).done
  assert.equal(outcomes.at(-1).state, 'failed')
  assert.match(outcomes.at(-1).message, /changed/)
})

test('not switched on, or the address held by a Mac site: said plainly, nothing published', async () => {
  for (const o of [{ configured: false }, { held: true }]) {
    const { answer, outcomes, calls } = setup(o)
    await (await answer('once', { fingerprint: FP })).done
    assert.equal(calls.publish.length, 0)
    assert.equal(outcomes.length, 1)
    assert.equal(outcomes[0].state, 'failed')
  }
})

test('a command in a form we do not act on (a pipe, no --files): it runs and prints its own usage; nothing published', async () => {
  for (const command of ['ola-publish site --files index.html | cat', 'ola-publish site']) {
    const { answer, outcomes, calls } = setup({ command })
    const r = await answer('once', { fingerprint: FP })
    assert.equal(r.decision, 'once')
    await r.done
    assert.equal(calls.publish.length + outcomes.length, 0)
  }
})

test('a page instead of a folder: published as that page', async () => {
  const { answer, calls } = setup({ command: 'ola-publish ./flyer.html --files index.html,style.css' })
  await (await answer('once', { fingerprint: FP })).done
  assert.deepEqual(calls.publish[0].sel, { page: 'flyer.html' })
})

test('"take it down" in the conversation: ola-publish unpublish, the owner’s yes takes the pages down and the command is told', async () => {
  const outcomes = []
  let down = 0
  const cp = makeChatPublish({
    sites: { configured: () => true, status: () => ({ url: 'https://sites.ola.cx/tenants/' }), unpublish: async () => (down++, { status: 200, body: { unpublished: true, url: 'https://sites.ola.cx/tenants/', gone: true, files: 2 } }) },
    siteCtx: () => ({}),
    heldByPerson: () => false,
    publishResult: async (slug, o) => (outcomes.push(o), true),
  })
  const oc = async () => ({ json: [{ id: 'per_1', action: 'shell', resources: ['ola-publish unpublish'] }] })
  const r = await cp.onReply({ slug: 'tenants', id: 1, role: 'owner' }, { personId: 7 }, 'ses_1', 'per_1', 'once', {}, oc)
  assert.equal(r.decision, 'once')
  await r.done
  assert.equal(down, 1)
  assert.deepEqual(outcomes.map((o) => o.state), ['publishing', 'done'])
  assert.equal(outcomes[1].unpublished, true)
  const member = await cp.onReply({ slug: 'tenants', id: 1, role: 'member' }, { personId: 8 }, 'ses_1', 'per_1', 'once', {}, oc)
  await member.done
  assert.equal(down, 1, 'a member’s yes takes nothing down')
  assert.equal(outcomes.at(-1).state, 'failed')
  const no = await cp.onReply({ slug: 'tenants', id: 1, role: 'owner' }, { personId: 7 }, 'ses_1', 'per_1', 'reject', {}, oc)
  assert.equal(no.decision, 'reject')
  assert.equal(down, 1)
})
