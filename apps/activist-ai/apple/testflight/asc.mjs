// The App Store Connect API for Ola's TestFlight scripts: a fresh ES256 token per call, errors
// thrown with Apple's own code and words (never the token or the key). ASC_KEY_ID picks the key
// in ~/.appstoreconnect/private_keys (this iMac: 748UX45NAP); the issuer is the team's.
import crypto from 'node:crypto'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import dns from 'node:dns'; dns.setDefaultResultOrder('ipv4first')
export const KID = process.env.ASC_KEY_ID ?? '748UX45NAP'
export const ISS = '69a6de80-eb13-47e3-e053-5b8c7c11a4d1'
export const TEAM = '274T5WCVD2'
const keyFile = path.join(os.homedir(), '.appstoreconnect/private_keys', `AuthKey_${KID}.p8`)
if (!fs.existsSync(keyFile)) { console.error(`error: no App Store Connect key ${KID} in ~/.appstoreconnect/private_keys`); process.exit(1) }
const key = fs.readFileSync(keyFile)
function token() {
  const now = Math.floor(Date.now() / 1000), b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = b64({ alg: 'ES256', kid: KID, typ: 'JWT' }) + '.' + b64({ iss: ISS, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' })
  return head + '.' + crypto.sign('sha256', Buffer.from(head), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
}
export class AscError extends Error {
  constructor(method, p, status, errors) {
    const e = errors?.[0] ?? {}
    super(`${method} ${p.split('?')[0]} → ${status} ${e.code ?? ''}: ${e.detail ?? e.title ?? ''}`.trim())
    this.status = status; this.code = e.code ?? ''; this.errors = errors ?? []
  }
  // Apple refusing because the team has an agreement to accept first.
  get agreement() { return /agreement|PLA|CONTRACT/i.test(this.message + JSON.stringify(this.errors)) }
}
export async function api(method, p, body) {
  const r = await fetch('https://api.appstoreconnect.apple.com' + p, {
    method, headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await r.text(); let j = {}
  try { j = t ? JSON.parse(t) : {} } catch { j = { errors: [{ detail: t.slice(0, 200) }] } }
  if (!r.ok) throw new AscError(method, p, r.status, j.errors)
  return j
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
