// Mint a provisioning profile over the App Store Connect API and install it
// in Xcode's profiles folder — for Macs with no Xcode account signed in
// (`-allowProvisioningUpdates` says "No Accounts").
//
//   node apps/feynd/testflight/mint-profile.mjs --name "feynd appstore air" \
//     --type IOS_APP_STORE --bundle L74V9QD69L --cert-serial <hex serial> [--devices all]
//   node apps/feynd/testflight/mint-profile.mjs --list-certs
//   node apps/feynd/testflight/mint-profile.mjs --enable-capability PUSH_NOTIFICATIONS --bundle L74V9QD69L
//
// The cert serial is the local signing cert's:
//   security find-certificate -c "Apple Distribution: Bart Decrem" -p | openssl x509 -noout -serial
// ASC_KEY_ID picks the API key (~/.appstoreconnect/private_keys/AuthKey_<id>.p8);
// the issuer is the team's. Types: IOS_APP_STORE, IOS_APP_DEVELOPMENT (needs
// --devices all), MAC_CATALYST_APP_STORE.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const KID = process.env.ASC_KEY_ID ?? 'FA7268Q94U'
const ISS = '69a6de80-eb13-47e3-e053-5b8c7c11a4d1'
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : []).filter(Boolean))

const key = fs.readFileSync(path.join(os.homedir(), `.appstoreconnect/private_keys/AuthKey_${KID}.p8`))
function jwt() {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const head = b64({ alg: 'ES256', kid: KID, typ: 'JWT' })
  const body = b64({ iss: ISS, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  return `${head}.${body}.${sig}`
}
async function api(method, p, body) {
  const r = await fetch('https://api.appstoreconnect.apple.com' + p, {
    method, headers: { Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${JSON.stringify(j.errors ?? j)}`)
  return j
}

// --register-device <udid> --device-name "<name>": add an iPhone to the
// account first (a new phone must be registered before a development
// profile can include it).
if (args['register-device']) {
  const udid = String(args['register-device'])
  const have = (await api('GET', `/v1/devices?filter[udid]=${udid}`)).data
  if (have.length) console.log('device already registered', have[0].id, have[0].attributes.name, have[0].attributes.status)
  else {
    const d = (await api('POST', '/v1/devices', { data: { type: 'devices', attributes: { name: args['device-name'] || 'iPhone', platform: 'IOS', udid } } })).data
    console.log('registered device', d.id, d.attributes.name)
  }
}
// --enable-capability PUSH_NOTIFICATIONS --bundle <id>: turn a capability on
// for the App ID before minting (profiles minted afterwards carry it; ones
// minted before do NOT — re-mint them). Exits after when no --name is given.
if (args['enable-capability']) {
  const type = String(args['enable-capability'])
  if (!args.bundle) { console.error('--bundle required with --enable-capability'); process.exit(1) }
  const have = (await api('GET', `/v1/bundleIds/${args.bundle}/bundleIdCapabilities`)).data
  if (have.some((c) => c.attributes.capabilityType === type)) console.log('capability already on:', type)
  else {
    await api('POST', '/v1/bundleIdCapabilities', { data: { type: 'bundleIdCapabilities', attributes: { capabilityType: type }, relationships: { bundleId: { data: { type: 'bundleIds', id: args.bundle } } } } })
    console.log('capability enabled:', type)
  }
  if (!args.name) process.exit(0)
}
const certs = (await api('GET', '/v1/certificates?limit=200')).data
if (args['list-certs']) {
  for (const c of certs) console.log(c.id, c.attributes.certificateType, c.attributes.serialNumber, c.attributes.displayName, c.attributes.expirationDate?.slice(0, 10))
  process.exit(0)
}
for (const k of ['name', 'type', 'bundle']) if (!args[k]) { console.error(`--${k} required`); process.exit(1) }
// --cert-serial <hex> picks one cert; --all-dev-certs takes every development
// cert (one profile that signs on every Mac).
let picked
if (args['all-dev-certs']) {
  picked = certs.filter((c) => ['DEVELOPMENT', 'IOS_DEVELOPMENT'].includes(c.attributes.certificateType))
} else {
  if (!args['cert-serial']) { console.error('--cert-serial or --all-dev-certs required'); process.exit(1) }
  const serial = String(args['cert-serial']).toUpperCase().replace(/^0+/, '')
  picked = certs.filter((c) => c.attributes.serialNumber.toUpperCase().replace(/^0+/, '') === serial)
}
if (!picked.length) { console.error('no matching ASC certificate — run --list-certs'); process.exit(1) }
for (const c of picked) console.log('cert', c.id, c.attributes.certificateType, c.attributes.displayName)

const rel = {
  bundleId: { data: { type: 'bundleIds', id: args.bundle } },
  certificates: { data: picked.map((c) => ({ type: 'certificates', id: c.id })) },
}
if (args.devices) {
  const devices = (await api('GET', '/v1/devices?limit=200&filter[platform]=IOS&filter[status]=ENABLED')).data
  rel.devices = { data: devices.map((d) => ({ type: 'devices', id: d.id })) }
  console.log('devices', devices.map((d) => d.attributes.name).join(', '))
}
// A profile with this name already there? Replace it (ASC names are unique).
const existing = (await api('GET', `/v1/profiles?filter[name]=${encodeURIComponent(args.name)}`)).data
for (const p of existing) { await api('DELETE', `/v1/profiles/${p.id}`); console.log('deleted old', p.id) }
const prof = (await api('POST', '/v1/profiles', {
  data: { type: 'profiles', attributes: { name: args.name, profileType: args.type }, relationships: rel },
})).data
const dir = path.join(os.homedir(), 'Library/Developer/Xcode/UserData/Provisioning Profiles')
fs.mkdirSync(dir, { recursive: true })
const out = path.join(dir, `${prof.attributes.uuid}.mobileprovision`)
fs.writeFileSync(out, Buffer.from(prof.attributes.profileContent, 'base64'))
console.log('installed', prof.attributes.name, prof.attributes.profileType, 'expires', prof.attributes.expirationDate?.slice(0, 10), '→', out)
