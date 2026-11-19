// Loaded into a server the model wrote (node --import), so the check can run it with no key and no
// way out to a model: fetch to an AI host gets the stub's answer; http(s).request to one fails.
// Every stubbed call is counted in $APPS_STUB_LOG.
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { AI_HOSTS, stubBody } from './stub.mjs'

const log = process.env.APPS_STUB_LOG
const real = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || String(input)
  if (AI_HOSTS.test(url)) {
    if (log) fs.appendFileSync(log, `server ${url}\n`)
    return new Response(stubBody(), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'stub' } })
  }
  return real(input, init)
}
for (const mod of [http, https]) {
  for (const k of ['request', 'get']) {
    const orig = mod[k]
    mod[k] = function (...a) {
      const o = a[0]
      const host = typeof o === 'string' ? o : o instanceof URL ? o.href : `${o?.hostname || o?.host || ''}:${o?.port || ''}`
      if (AI_HOSTS.test(host)) throw new Error('blocked by the app check: AI calls go through fetch to the stub')
      return orig.apply(this, a)
    }
  }
}
