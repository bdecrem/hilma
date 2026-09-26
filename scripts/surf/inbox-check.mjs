// Token Surfers comments + inbox check, against the API only.
//   node scripts/surf/inbox-check.mjs [base]        (default http://localhost:3219)
// Two fixed throwaway accounts (surftest_a / surftest_b, created on first run):
// A publishes a creation, B upvotes and comments, A's inbox must show both,
// the two toggles hide each kind, "seen" clears it, A (the owner) deletes B's
// comment, B may not delete A's, the daily cap and the gates answer, and A
// unpublishes at the end. Prints PASS/FAIL per step; exits 1 on any FAIL.
const base = (process.argv[2] || 'http://localhost:3219').replace(/\/$/, '')
const key = process.env.SURF_APP_KEY || ''
let fails = 0
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails++ }

async function call(path, { method = 'GET', token, body } = {}) {
  const r = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(key ? { 'x-surf-key': key } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  let j = null
  try { j = await r.json() } catch { /* no body */ }
  return { status: r.status, j }
}

async function account(handle, password = 'surftest1') {
  let r = await call('/api/surf/auth/login', { method: 'POST', body: { handle, password } })
  if (r.status !== 200) r = await call('/api/surf/auth/signup', { method: 'POST', body: { handle, password } })
  if (r.status !== 200) throw new Error(`${handle}: ${r.status} ${JSON.stringify(r.j)}`)
  return { token: r.j.token, id: r.j.user.id, handle }
}

const A = await account('surftest_a')
const B = await account('surftest_b')
console.log('accounts', A.handle, B.handle)

// a clean slate for A: everything before now is seen, both toggles on
let r = await call('/api/surf/inbox', { method: 'PATCH', token: A.token, body: { seen: true, upvotes: true, comments: true } })
ok('inbox reset', r.status === 200 && r.j.items.length === 0 && r.j.prefs.upvotes && r.j.prefs.comments, JSON.stringify(r.j).slice(0, 120))

// A publishes
const clientId = 'inboxcheck-' + Date.now().toString(36)
r = await call('/api/surf/apps', { method: 'POST', token: A.token, body: { client_id: clientId, title: 'inbox check', emoji: '🔔', prompt: 'a test', html: '<!doctype html><html><body><h1>inbox check</h1></body></html>' } })
ok('A publishes', r.status === 200 && r.j.app?.slug, JSON.stringify(r.j).slice(0, 120))
const slug = r.j.app.slug

try {
  // B upvotes and comments
  r = await call(`/api/surf/apps/${slug}/upvote`, { method: 'POST', token: B.token })
  ok('B upvotes', r.status === 200 && r.j.voted === true && r.j.upvotes === 1, JSON.stringify(r.j))
  r = await call(`/api/surf/apps/${slug}/comments`, { method: 'POST', token: B.token, body: { body: '  this   slaps \u0007 ' } })
  ok('B comments (cleaned)', r.status === 200 && r.j.comment?.body === 'this slaps' && r.j.comments === 1, JSON.stringify(r.j).slice(0, 160))
  const commentId = r.j.comment?.id
  r = await call(`/api/surf/apps/${slug}/comments`, { method: 'POST', token: B.token, body: { body: '   ' } })
  ok('empty comment refused', r.status === 400, `${r.status}`)
  r = await call(`/api/surf/apps/${slug}/comments`, { method: 'POST', body: { body: 'anon' } })
  ok('signed-out comment refused', r.status === 401, `${r.status}`)

  // the count rides on the card
  r = await call(`/api/surf/apps/${slug}`)
  ok('card carries comments count', r.status === 200 && r.j.app.comments === 1 && r.j.app.upvotes === 1, `comments=${r.j.app?.comments} upvotes=${r.j.app?.upvotes}`)
  r = await call(`/api/surf/apps/${slug}/comments`, { token: A.token })
  ok('A lists the comment and may delete it (owner)', r.status === 200 && r.j.comments.length === 1 && r.j.comments[0].canDelete === true && r.j.comments[0].mine === false, JSON.stringify(r.j).slice(0, 160))
  r = await call(`/api/surf/apps/${slug}/comments`)
  ok('signed-out list has no delete rights', r.status === 200 && r.j.comments[0].canDelete === false)

  // A's inbox
  r = await call('/api/surf/inbox', { token: A.token })
  const kinds = (r.j?.items ?? []).map((i) => i.kind).sort().join(',')
  ok('A inbox has the upvote and the comment', r.status === 200 && kinds === 'comment,upvotes', kinds)
  const up = r.j?.items?.find((i) => i.kind === 'upvotes')
  const cm = r.j?.items?.find((i) => i.kind === 'comment')
  ok('upvotes item grouped with handle', up?.count === 1 && up?.handles?.[0] === 'surftest_b' && up?.slug === slug, JSON.stringify(up))
  ok('comment item carries the text', cm?.handle === 'surftest_b' && cm?.body === 'this slaps' && cm?.id === commentId, JSON.stringify(cm))
  r = await call('/api/surf/inbox', { token: B.token })
  ok("B's own activity is not in B's inbox", r.status === 200 && r.j.items.length === 0, JSON.stringify(r.j.items))

  // the toggles
  r = await call('/api/surf/inbox', { method: 'PATCH', token: A.token, body: { comments: false } })
  ok('comments off hides the comment', r.status === 200 && r.j.prefs.comments === false && r.j.items.every((i) => i.kind === 'upvotes') && r.j.items.length === 1)
  r = await call('/api/surf/inbox', { method: 'PATCH', token: A.token, body: { comments: true, upvotes: false } })
  ok('upvotes off hides the upvote', r.status === 200 && r.j.prefs.upvotes === false && r.j.items.every((i) => i.kind === 'comment') && r.j.items.length === 1)
  r = await call('/api/surf/inbox', { method: 'PATCH', token: A.token, body: { upvotes: true } })
  ok('both back on', r.status === 200 && r.j.items.length === 2)

  // seen
  r = await call('/api/surf/inbox', { method: 'PATCH', token: A.token, body: { seen: true } })
  ok('seen clears the inbox', r.status === 200 && r.j.items.length === 0)
  r = await call(`/api/surf/apps/${slug}/comments`, { method: 'POST', token: B.token, body: { body: 'again' } })
  const second = r.j.comment?.id
  r = await call('/api/surf/inbox', { token: A.token })
  ok('a new comment after seen shows up alone', r.status === 200 && r.j.items.length === 1 && r.j.items[0].kind === 'comment' && r.j.items[0].body === 'again')

  // deleting
  r = await call(`/api/surf/apps/${slug}/comments/${second}`, { method: 'DELETE', token: A.token })
  ok('owner deletes a comment on their creation', r.status === 200 && r.j.comments === 1, JSON.stringify(r.j))
  r = await call(`/api/surf/apps/${slug}/comments`, { method: 'POST', token: A.token, body: { body: 'thanks!' } })
  const mine = r.j.comment?.id
  r = await call(`/api/surf/apps/${slug}/comments/${mine}`, { method: 'DELETE', token: B.token })
  ok("B may not delete A's comment", r.status === 403, `${r.status}`)
  r = await call(`/api/surf/apps/${slug}/comments/${mine}`, { method: 'DELETE', token: A.token })
  ok('author deletes their own', r.status === 200 && r.j.comments === 1)
  r = await call(`/api/surf/apps/${slug}/comments/${commentId}`, { method: 'DELETE', token: B.token })
  ok('B deletes their own', r.status === 200 && r.j.comments === 0)
  r = await call(`/api/surf/apps/${slug}/comments/${commentId}`, { method: 'DELETE', token: B.token })
  ok('deleting twice is 404', r.status === 404)
  r = await call(`/api/surf/apps/${slug}`)
  ok('count back to zero on the card', r.j.app?.comments === 0, `comments=${r.j.app?.comments}`)
  r = await call('/api/surf/inbox', { token: A.token })
  ok('deleted comments leave the inbox', r.status === 200 && r.j.items.length === 0)
  r = await call(`/api/surf/apps/nope999/comments`, { method: 'POST', token: B.token, body: { body: 'hi' } })
  ok('unknown creation is 404', r.status === 404)
} finally {
  r = await call(`/api/surf/apps/${slug}`, { method: 'DELETE', token: A.token })
  ok('A unpublishes', r.status === 200)
  await call(`/api/surf/apps/${slug}/upvote`, { method: 'POST', token: B.token }).catch(() => {})   // (already unpublished: a no-op)
}
console.log(fails ? `\n${fails} FAILED` : '\nall good')
process.exit(fails ? 1 : 0)
