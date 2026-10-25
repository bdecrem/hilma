// After an upload: wait for App Store Connect to process the build, add it to every beta
// group of the app, and submit it for beta review when an external group exists.
//   node testflight/asc-submit.mjs <buildNumber> [IOS|MAC_OS]
// The app is found by bundle id (com.bartdecrem.Takt); ASC_KEY_ID picks the key (FA7268Q94U).
import crypto from 'crypto'; import fs from 'fs'; import dns from 'dns'; dns.setDefaultResultOrder('ipv4first')
const KID = process.env.ASC_KEY_ID ?? 'FA7268Q94U', ISS = '69a6de80-eb13-47e3-e053-5b8c7c11a4d1'
const VER = process.argv[2], PLAT = process.argv[3] ?? 'IOS'
if (!VER) { console.error('usage: node asc-submit.mjs <buildNumber> [IOS|MAC_OS]'); process.exit(1) }
const key = fs.readFileSync(process.env.HOME + '/.appstoreconnect/private_keys/AuthKey_' + KID + '.p8')
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const unsigned = b64({ alg: 'ES256', kid: KID, typ: 'JWT' }) + '.' + b64({ iss: ISS, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' })
const TOK = unsigned + '.' + crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
const B = 'https://api.appstoreconnect.apple.com/v1'
const api = async (p, m = 'GET', body) => {
  const r = await fetch(B + p, { method: m, headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); if (!r.ok) throw new Error(m + ' ' + p + ' ' + r.status + ' ' + t.slice(0, 300)); return t ? JSON.parse(t) : {}
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const app = (await api('/apps?filter[bundleId]=com.bartdecrem.Takt')).data[0]
if (!app) { console.error('no App Store Connect app for com.bartdecrem.Takt: create it in the web UI first'); process.exit(1) }
let build
for (let i = 0; i < 90; i++) {
  const d = await api(`/builds?filter[app]=${app.id}&filter[version]=${VER}&filter[preReleaseVersion.platform]=${PLAT}`)
  build = d.data[0]; const st = build?.attributes.processingState
  console.log(`build ${VER} (${PLAT}):`, st ?? 'not yet')
  if (st === 'VALID') break
  if (st === 'FAILED' || st === 'INVALID') process.exit(1)
  await sleep(30000)
}
if (build?.attributes.processingState !== 'VALID') { console.error(`not processed after 45 min; rerun: node testflight/asc-submit.mjs ${VER} ${PLAT}`); process.exit(1) }
const groups = (await api(`/apps/${app.id}/betaGroups`)).data
for (const g of groups) {
  try { await api(`/betaGroups/${g.id}/relationships/builds`, 'POST', { data: [{ type: 'builds', id: build.id }] }); console.log('added to', g.attributes.name) }
  catch (e) { console.log('add to', g.attributes.name + ':', e.message.slice(0, 160)) }
}
if (groups.some(g => !g.attributes.isInternalGroup)) {
  try {
    await api('/betaAppReviewSubmissions', 'POST', { data: { type: 'betaAppReviewSubmissions', relationships: { build: { data: { type: 'builds', id: build.id } } } } })
    console.log(`submitted ${VER} for beta review`)
  } catch (e) { console.log('submit:', e.message.slice(0, 300)) }
}
