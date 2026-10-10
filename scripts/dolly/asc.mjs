// App Store Connect chores for Dolly's record — Polly's app (6813318254),
// renamed. Same JWT as polly's testflight/asc-submit.mjs.
//
//   node scripts/dolly/asc.mjs info             # name, bundle id capabilities, latest builds
//   node scripts/dolly/asc.mjs rename Dolly     # the App Store name on the editable version
//   node scripts/dolly/asc.mjs domains          # enable Associated Domains on com.bartdecrem.Polly
//   node scripts/dolly/asc.mjs profile <name>   # re-mint the IOS_APP_STORE profile <name> for this Mac's cert
//                                               # (ASC_CERT_SERIAL=<hex serial of the Apple Distribution cert>)
//
// Env: ASC_KEY_ID (default 748UX45NAP, this iMac M1's key), the .p8 in
// ~/.appstoreconnect/private_keys.
import crypto from 'node:crypto'
import fs from 'node:fs'
import dns from 'node:dns'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

dns.setDefaultResultOrder('ipv4first')
const KID = process.env.ASC_KEY_ID ?? '748UX45NAP'
const ISS = '69a6de80-eb13-47e3-e053-5b8c7c11a4d1'
const APP = process.env.DOLLY_ASC_APP_ID ?? '6813318254'
const BUNDLE = 'com.bartdecrem.Polly'
const key = fs.readFileSync(path.join(os.homedir(), '.appstoreconnect/private_keys', `AuthKey_${KID}.p8`))
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const unsigned = b64({ alg: 'ES256', kid: KID, typ: 'JWT' }) + '.' + b64({ iss: ISS, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' })
const TOK = unsigned + '.' + crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
const B = 'https://api.appstoreconnect.apple.com/v1'

async function api(p, method = 'GET', body) {
  const r = await fetch(p.startsWith('http') ? p : B + p, {
    method,
    headers: { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`${method} ${p} ${r.status} ${t.slice(0, 600)}`)
  return t ? JSON.parse(t) : {}
}

async function bundleId() {
  const d = await api(`/bundleIds?filter[identifier]=${BUNDLE}`)
  const b = d.data.find((x) => x.attributes.identifier === BUNDLE)
  if (!b) throw new Error(`bundle id ${BUNDLE} not found`)
  return b
}

const cmd = process.argv[2]
if (cmd === 'info') {
  const app = await api(`/apps/${APP}?include=appInfos`)
  console.log('app', app.data.attributes.name, app.data.attributes.bundleId)
  for (const info of app.included ?? []) {
    const locs = await api(`/appInfos/${info.id}/appInfoLocalizations`)
    console.log(' appInfo', info.id, info.attributes.appStoreState, locs.data.map((l) => `${l.attributes.locale}: "${l.attributes.name}" / "${l.attributes.subtitle ?? ''}"`).join(', '))
  }
  const b = await bundleId()
  const caps = await api(`/bundleIds/${b.id}/bundleIdCapabilities`)
  console.log('bundle', b.id, 'capabilities', caps.data.map((c) => c.attributes.capabilityType).join(', ') || 'none')
  const profiles = await api(`/profiles?filter[profileType]=IOS_APP_STORE&limit=50`)
  for (const p of profiles.data) if (/polly/i.test(p.attributes.name)) console.log(' profile', p.id, p.attributes.name, p.attributes.profileState, p.attributes.expirationDate?.slice(0, 10))
  const builds = await api(`/builds?filter[app]=${APP}&sort=-uploadedDate&limit=3`)
  for (const bd of builds.data) console.log(' build', bd.attributes.version, bd.attributes.processingState, bd.attributes.uploadedDate?.slice(0, 10))
} else if (cmd === 'rename') {
  const name = process.argv[3]
  if (!name) throw new Error('usage: asc.mjs rename <name>')
  const app = await api(`/apps/${APP}?include=appInfos`)
  let done = 0
  for (const info of app.included ?? []) {
    const locs = await api(`/appInfos/${info.id}/appInfoLocalizations`)
    for (const l of locs.data) {
      try {
        await api(`/appInfoLocalizations/${l.id}`, 'PATCH', { data: { type: 'appInfoLocalizations', id: l.id, attributes: { name } } })
        console.log(`renamed ${l.attributes.locale} (${info.attributes.appStoreState}) "${l.attributes.name}" → "${name}"`)
        done++
      } catch (e) {
        console.log(`skipped ${l.attributes.locale} (${info.attributes.appStoreState}): ${e.message.slice(0, 900)}`)
      }
    }
  }
  if (!done) process.exit(1)
} else if (cmd === 'domains') {
  const b = await bundleId()
  const caps = await api(`/bundleIds/${b.id}/bundleIdCapabilities`)
  if (caps.data.some((c) => c.attributes.capabilityType === 'ASSOCIATED_DOMAINS')) {
    console.log('Associated Domains already on')
  } else {
    await api('/bundleIdCapabilities', 'POST', {
      data: { type: 'bundleIdCapabilities', attributes: { capabilityType: 'ASSOCIATED_DOMAINS' }, relationships: { bundleId: { data: { type: 'bundleIds', id: b.id } } } },
    })
    console.log('Associated Domains enabled on', BUNDLE)
  }
} else if (cmd === 'profile') {
  const name = process.argv[3]
  if (!name) throw new Error('usage: asc.mjs profile <name>')
  const b = await bundleId()
  // This Mac's Apple Distribution cert, matched by serial against ASC's list.
  const serial = (process.env.ASC_CERT_SERIAL ?? execFileSync('bash', ['-c', `security find-certificate -c "Apple Distribution: Bart Decrem" -p | openssl x509 -noout -serial | cut -d= -f2`]).toString().trim()).toUpperCase().replace(/^0+/, '')
  const certs = await api('/certificates?filter[certificateType]=DISTRIBUTION&limit=50')
  const cert = certs.data.find((c) => (c.attributes.serialNumber ?? '').toUpperCase().replace(/^0+/, '') === serial)
  if (!cert) throw new Error(`no DISTRIBUTION certificate on ASC with serial ${serial}; have ${certs.data.map((c) => c.attributes.serialNumber).join(', ')}`)
  const existing = await api(`/profiles?filter[name]=${encodeURIComponent(name)}`)
  for (const p of existing.data) {
    await api(`/profiles/${p.id}`, 'DELETE')
    console.log('deleted old profile', p.id, p.attributes.profileState)
  }
  const made = await api('/profiles', 'POST', {
    data: {
      type: 'profiles',
      attributes: { name, profileType: 'IOS_APP_STORE' },
      relationships: { bundleId: { data: { type: 'bundleIds', id: b.id } }, certificates: { data: [{ type: 'certificates', id: cert.id }] } },
    },
  })
  const dir = path.join(os.homedir(), 'Library/Developer/Xcode/UserData/Provisioning Profiles')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${made.data.attributes.uuid}.mobileprovision`)
  fs.writeFileSync(file, Buffer.from(made.data.attributes.profileContent, 'base64'))
  // Drop stale copies of the same-named profile from the Xcode dir.
  for (const f of fs.readdirSync(dir)) {
    if (f === path.basename(file) || !f.endsWith('.mobileprovision')) continue
    const n = execFileSync('bash', ['-c', `security cms -D -i "${path.join(dir, f)}" 2>/dev/null | plutil -extract Name raw - 2>/dev/null || true`]).toString().trim()
    if (n === name) { fs.unlinkSync(path.join(dir, f)); console.log('removed stale', f) }
  }
  console.log('minted', name, made.data.attributes.uuid, '→', file)
} else {
  console.error('usage: node scripts/dolly/asc.mjs info | rename <name> | domains | profile <name>')
  process.exit(1)
}
