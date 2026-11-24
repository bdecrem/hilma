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

test('a command in a form we do not act on (a pipe, no --files): a yes is answered no with the reason, never yes; nothing published (OLA-421)', async () => {
  for (const command of ['ola-publish site --files index.html | cat', 'ola-publish site']) {
    const { answer, outcomes, calls } = setup({ command })
    const r = await answer('once', { fingerprint: FP })
    assert.equal(r.decision, 'reject')
    assert.match(r.message, /^Not published, though the person said yes: /)
    await r.done
    assert.equal(calls.publish.length + outcomes.length, 0)
  }
})

test('a status with a pipe after it (the OLA-421 check: ola-publish status 2>&1 | tail -20): never run, and the reason says it tells nothing about the page', async () => {
  for (const command of ['ola-publish status 2>&1 | tail -20', 'ola-publish status | head', 'ola-publish status; ls']) {
    const { answer, outcomes, calls } = setup({ command })
    const r = await answer('once')
    assert.equal(r.decision, 'reject')
    assert.match(r.message, /^Not run: it says nothing about whether the page is live/)
    assert.match(r.message, /`ola-publish status` by itself/)
    assert.doesNotMatch(r.message, /Not published/)
    assert.equal(calls.publish.length + outcomes.length, 0)
  }
  // The plain status, with or without 2>&1, is still never asked: the usual path.
  assert.equal(await setup({ command: 'ola-publish status 2>&1' }).answer('once'), null)
})

test('every publish yes and every refusal leaves a line in the log; an answer to no pending ask too (OLA-421)', async () => {
  const lines = []
  const outcomes = []
  const sites = { configured: () => true, status: () => null, preview: async () => ({ status: 200, body: { items: ITEMS, fingerprint: FP, url: 'u' } }), publish: async () => ({ status: 200, body: { url: 'u', files: 2, live: true } }) }
  const mk = (publishResult, role = 'owner', pending = [{ id: 'per_1', action: 'shell', resources: ['ola-publish site --files index.html,style.css'] }]) => {
    const cp = makeChatPublish({ sites, siteCtx: () => ({}), heldByPerson: () => false, publishResult, log: (l) => lines.push(l) })
    const oc = async (m, p) => (m === 'GET' ? { status: 200, json: pending } : { status: 200 })
    return cp.onReply({ slug: 'tenants', id: 1, role }, { personId: 7 }, 'ses_1', 'per_1', 'once', { fingerprint: FP }, oc)
  }
  await (await mk(async (s, o) => (outcomes.push(o), true))).done
  assert.ok(lines.some((l) => /tenants: a publish yes from the conversation \(2 files, with the card's fingerprint\)/.test(l)), lines.join('\n'))
  lines.length = 0
  await (await mk(async () => false, 'member')).done
  assert.ok(lines.some((l) => /was refused \(Only the project/.test(l)), lines.join('\n'))
  assert.ok(lines.some((l) => /the publish outcome \(failed\) did not reach the project/.test(l)), lines.join('\n'))
  lines.length = 0
  assert.equal(await mk(async () => true, 'owner', []), null)
  assert.ok(lines.some((l) => /an answer to ask per_1 matched none of the 0 pending/.test(l)), lines.join('\n'))
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

// OLA-285: a git deploy's check of the address takes up to five minutes, longer than the command
// waits. What the address shows during the check goes to the VM as "publishing, checking", one write at
// a time, and the outcome is always the last write (a slow progress write never lands after it).
test('during the check, what the address shows goes to the VM as still checking; the outcome is written last', async () => {
  const outcomes = []
  let slow = 0
  const cp = makeChatPublish({
    sites: {
      configured: () => true,
      status: () => null,
      async preview() { return { status: 200, body: { items: ITEMS, fingerprint: FP, url: 'https://sites.ola.cx/tenants/' } } },
      async publish(ctx, sel, fp, opts) {
        const until = Date.now() + 300_000
        opts.onLook({ status: 200, shows: 'Old page', challenged: false, until })
        opts.onLook({ status: 200, shows: 'Old page again', challenged: false, until })
        opts.onLook({ status: 403, shows: '', challenged: true, until })
        return { status: 200, body: { url: 'https://sites.ola.cx/tenants/', files: 2, live: true, again: false, shows: 'New page', fingerprint: FP } }
      },
    },
    siteCtx: () => ({}),
    heldByPerson: () => false,
    progressMs: 0,
    // Progress writes are slow (a container exec); the outcome must still land last.
    publishResult: async (slug, o) => { if (o.stage) await new Promise((r) => setTimeout(r, 30 * ++slow)); outcomes.push(o); return true },
  })
  const pending = { json: [{ id: 'per_1', action: 'shell', resources: ['ola-publish site --files index.html,style.css'] }] }
  const oc = async () => pending
  const r = await cp.onReply({ slug: 'tenants', id: 1, role: 'owner' }, { personId: 7 }, 'ses_1', 'per_1', 'once', {}, oc)
  await r.done
  assert.equal(outcomes[0].state, 'publishing')
  assert.equal(outcomes[0].stage, undefined, 'the first note is the plain "publishing" before the command runs')
  const checking = outcomes.filter((o) => o.stage === 'checking')
  assert.ok(checking.length >= 1, JSON.stringify(outcomes))
  assert.equal(checking[0].url, 'https://sites.ola.cx/tenants/')
  assert.equal(checking[0].shows, 'Old page')
  assert.equal(checking[0].status, '200')
  assert.ok(checking[0].until > Date.now() / 1000)
  assert.equal(outcomes.at(-1).state, 'done', 'the outcome is the last write')
  assert.equal(outcomes.at(-1).live, true)
})

test('progress during the check is at most one write per PROGRESS_MS', async () => {
  const outcomes = []
  const cp = makeChatPublish({
    sites: {
      configured: () => true,
      status: () => null,
      async preview() { return { status: 200, body: { items: ITEMS, fingerprint: FP, url: 'https://sites.ola.cx/tenants/' } } },
      async publish(ctx, sel, fp, opts) {
        for (let i = 0; i < 20; i++) opts.onLook({ status: 200, shows: `read ${i}`, challenged: false, until: Date.now() + 1000 })
        return { status: 200, body: { url: 'https://sites.ola.cx/tenants/', files: 2, live: false, shows: 'read 19', fingerprint: FP } }
      },
    },
    siteCtx: () => ({}),
    heldByPerson: () => false,
    publishResult: async (slug, o) => (outcomes.push(o), true),
  })
  const r = await cp.onReply({ slug: 'tenants', id: 1, role: 'owner' }, { personId: 7 }, 'ses_1', 'per_1', 'once', {}, async () => ({ json: [{ id: 'per_1', action: 'shell', resources: ['ola-publish site --files index.html,style.css'] }] }))
  await r.done
  assert.equal(outcomes.filter((o) => o.stage === 'checking').length, 1)
  assert.equal(outcomes.at(-1).state, 'done')
})
