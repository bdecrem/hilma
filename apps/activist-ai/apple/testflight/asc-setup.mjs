// Ola's App Store Connect setup, over the API, safe to run again (each step checks first):
//   1. bundle id cx.ola.mac, shared by the iPhone app and the Mac app (one record, 2026-11-17)
//   2. Push Notifications on cx.ola.mac (the phone's notifications, apple/README.md)
//   3. the app record "Ola: private AI agent" for cx.ola.mac (made by hand; the API cannot), English (U.S.)
//   4. the internal TestFlight group "Ola internal" (every build), with the Account Holder in it
//   5. the IOS_APP_STORE profile "ola appstore m1" for this Mac's Apple Distribution
//      certificate, minted after push is on and installed for xcodebuild
//
//   node apps/activist-ai/apple/testflight/asc-setup.mjs
//
// No Mac app record: the Mac app ships as a Developer ID download, not through TestFlight
// (README.md here). Nothing public is made: no external group, no public link, no review.
// Prints no names, emails or keys. Exit 1 if any step failed, with Apple's words.
import { execSync } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { api, TEAM } from './asc.mjs'

const PHONE = 'cx.ola.mac' // the iPhone app uses the Mac's id and record
const APP_NAMES = ['Ola: private AI agent']
const SKU = 'cx-ola-phone', GROUP = 'Ola internal'
const PROFILE = process.env.OLA_PROFILE ?? 'ola appstore m1'
const results = []
const say = (step, state, note = '') => { results.push([step, state, note]); console.log(`${state.padEnd(8)} ${step}${note ? ': ' + note : ''}`) }

async function step(name, fn) {
  try { await fn() } catch (e) {
    if (e.message === 'waiting') return say(name, 'WAITING', 'needs the bundle id')
    say(name, e.agreement ? 'REFUSED' : 'FAILED', e.agreement ? 'Apple needs the updated Program License Agreement accepted first (' + e.code + ')' : e.message)
  }
}

let phoneId, appId, groupId
async function bundleId(identifier, platform, name) {
  const have = (await api('GET', `/v1/bundleIds?filter[identifier]=${identifier}&limit=5`)).data.find((b) => b.attributes.identifier === identifier)
  if (have) { say(`bundle id ${identifier}`, 'OK', 'already registered'); return have.id }
  const b = (await api('POST', '/v1/bundleIds', { data: { type: 'bundleIds', attributes: { identifier, name, platform } } })).data
  say(`bundle id ${identifier}`, 'MADE'); return b.id
}

await step(`bundle id ${PHONE}`, async () => { phoneId = await bundleId(PHONE, 'IOS', 'Ola phone') })

await step(`push notifications on ${PHONE}`, async () => {
  if (!phoneId) throw new Error('waiting')
  const caps = (await api('GET', `/v1/bundleIds/${phoneId}/bundleIdCapabilities`)).data
  if (caps.some((c) => c.attributes.capabilityType === 'PUSH_NOTIFICATIONS')) return say(`push notifications on ${PHONE}`, 'OK', 'already on')
  await api('POST', '/v1/bundleIdCapabilities', { data: { type: 'bundleIdCapabilities', attributes: { capabilityType: 'PUSH_NOTIFICATIONS' }, relationships: { bundleId: { data: { type: 'bundleIds', id: phoneId } } } } })
  say(`push notifications on ${PHONE}`, 'MADE')
})

await step('app record', async () => {
  const have = (await api('GET', `/v1/apps?filter[bundleId]=${PHONE}`)).data.find((a) => a.attributes.bundleId === PHONE)
  if (have) { appId = have.id; return say('app record', 'OK', `"${have.attributes.name}" (${have.id})`) }
  if (!phoneId) throw new Error('waiting')
  let last
  for (const name of APP_NAMES) {
    try {
      const a = (await api('POST', '/v1/apps', { data: { type: 'apps', attributes: { name, primaryLocale: 'en-US', sku: SKU }, relationships: { bundleId: { data: { type: 'bundleIds', id: phoneId } } } } })).data
      appId = a.id; return say('app record', 'MADE', `"${name}" (${a.id})`)
    } catch (e) {
      last = e
      if (e.agreement) throw e
      if (e.status === 403 || /does not allow 'CREATE'|not allowed/i.test(e.message)) break // the API cannot create apps: the web form below
      if (!/name|already|taken|used/i.test(e.message)) break
    }
  }
  say('app record', 'TODO', `${last?.message ?? ''}. Make it once in App Store Connect: Apps, +, New App: iOS, name "Ola" ` +
    `(if taken "Ola: private AI agent"), English (U.S.), bundle id ${PHONE}, SKU ${SKU}, Full Access. Then run this again.`)
})

await step('internal group', async () => {
  if (!appId) return say('internal group', 'WAITING', 'needs the app record')
  const groups = (await api('GET', `/v1/apps/${appId}/betaGroups?limit=50`)).data
  let g = groups.find((x) => x.attributes.name === GROUP && x.attributes.isInternalGroup)
  if (g) say('internal group', 'OK', `"${GROUP}" already there`)
  else {
    g = (await api('POST', '/v1/betaGroups', { data: { type: 'betaGroups', attributes: { name: GROUP, isInternalGroup: true, hasAccessToAllBuilds: true }, relationships: { app: { data: { type: 'apps', id: appId } } } } })).data
    say('internal group', 'MADE', `"${GROUP}", every build`)
  }
  groupId = g.id
})

await step('tester (the Account Holder)', async () => {
  if (!groupId) return say('tester (the Account Holder)', 'WAITING', 'needs the internal group')
  const holder = (await api('GET', '/v1/users?filter[roles]=ACCOUNT_HOLDER&limit=5')).data[0]
  if (!holder) throw new Error('no Account Holder visible to this key')
  const email = holder.attributes.username
  const inGroup = (await api('GET', `/v1/betaGroups/${groupId}/betaTesters?limit=200`)).data
  if (inGroup.some((t) => (t.attributes.email ?? '').toLowerCase() === email.toLowerCase())) return say('tester (the Account Holder)', 'OK', 'already in the group')
  // Always by email: adding an existing tester record to an internal group is a 409 (2026-11-17).
  await api('POST', '/v1/betaTesters', { data: { type: 'betaTesters', attributes: { email, firstName: holder.attributes.firstName, lastName: holder.attributes.lastName }, relationships: { betaGroups: { data: [{ type: 'betaGroups', id: groupId }] } } } })
  say('tester (the Account Holder)', 'MADE', 'added to the group (TestFlight sends the invitation)')
})

await step(`profile "${PROFILE}"`, async () => {
  if (!phoneId) throw new Error('waiting')
  const dir = path.join(os.homedir(), 'Library/Developer/Xcode/UserData/Provisioning Profiles')
  const localHasPush = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => {
    if (!f.endsWith('.mobileprovision')) return false
    const xml = execSync(`security cms -D -i ${JSON.stringify(path.join(dir, f))} 2>/dev/null || true`).toString()
    return xml.includes(`<string>${PROFILE}</string>`) && xml.includes('aps-environment') && !/<key>ExpirationDate<\/key>\s*<date>20(1|2[0-5])/.test(xml)
  })
  const serial = execSync(`security find-certificate -c "Apple Distribution: Bart Decrem (${TEAM})" -p | openssl x509 -noout -serial`).toString().trim().split('=')[1].replace(/^0+/, '').toUpperCase()
  const certs = (await api('GET', '/v1/certificates?limit=200')).data
  const cert = certs.find((c) => c.attributes.serialNumber.toUpperCase().replace(/^0+/, '') === serial)
  if (!cert) throw new Error("this Mac's Apple Distribution certificate is not on the account (revoked?)")
  const existing = (await api('GET', `/v1/profiles?filter[name]=${encodeURIComponent(PROFILE)}`)).data
  if (localHasPush && existing.some((p) => p.attributes.profileState === 'ACTIVE')) return say(`profile "${PROFILE}"`, 'OK', 'installed, with push')
  for (const p of existing) await api('DELETE', `/v1/profiles/${p.id}`)
  const prof = (await api('POST', '/v1/profiles', { data: { type: 'profiles', attributes: { name: PROFILE, profileType: 'IOS_APP_STORE' }, relationships: { bundleId: { data: { type: 'bundleIds', id: phoneId } }, certificates: { data: [{ type: 'certificates', id: cert.id }] } } } })).data
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${prof.attributes.uuid}.mobileprovision`), Buffer.from(prof.attributes.profileContent, 'base64'))
  say(`profile "${PROFILE}"`, 'MADE', `installed, expires ${prof.attributes.expirationDate?.slice(0, 10)}`)
})

const bad = results.filter(([, s]) => ['FAILED', 'REFUSED', 'TODO'].includes(s))
console.log(bad.length ? `\n${bad.length} step(s) not done.` : '\nApp Store Connect is ready: apps/activist-ai/apple/testflight/ship-via-mini.sh')
process.exit(bad.length ? 1 : 0)
