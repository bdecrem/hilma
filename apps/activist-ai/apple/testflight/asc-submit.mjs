// After an upload: wait for App Store Connect to process the build, make sure it is in the
// internal group "Ola internal" (a group with every build gets it by itself; adding it then is a
// 422), and say where it stands. Internal testers need no beta review, so nothing is submitted.
//   node apps/activist-ai/apple/testflight/asc-submit.mjs <buildNumber> [IOS|MAC_OS]
// The app is found by bundle id (cx.ola.phone); ASC_KEY_ID picks the key (748UX45NAP here).
import { api, sleep } from './asc.mjs'
const BUILD = process.argv[2], PLAT = process.argv[3] ?? 'IOS', BUNDLE = PLAT === 'MAC_OS' ? 'cx.ola.mac' : 'cx.ola.phone'
if (!BUILD) { console.error('usage: node asc-submit.mjs <buildNumber> [IOS|MAC_OS]'); process.exit(1) }
const app = (await api('GET', `/v1/apps?filter[bundleId]=${BUNDLE}`)).data[0]
if (!app) { console.error(`no App Store Connect app for ${BUNDLE}: run node testflight/asc-setup.mjs`); process.exit(1) }
let build
const t0 = Date.now()
for (let i = 0; i < 90; i++) {
  build = (await api('GET', `/v1/builds?filter[app]=${app.id}&filter[version]=${BUILD}&filter[preReleaseVersion.platform]=${PLAT}`)).data[0]
  const st = build?.attributes.processingState
  console.log(`build ${BUILD} (${PLAT}) after ${Math.round((Date.now() - t0) / 60000)} min:`, st ?? 'not listed yet')
  if (st === 'VALID') break
  if (st === 'FAILED' || st === 'INVALID') { console.error('App Store Connect rejected the build: see the email Apple sent, or the build in App Store Connect'); process.exit(1) }
  await sleep(30000)
}
if (build?.attributes.processingState !== 'VALID') { console.error(`not processed after 45 min; rerun: node testflight/asc-submit.mjs ${BUILD} ${PLAT}`); process.exit(1) }
const groups = (await api('GET', `/v1/apps/${app.id}/betaGroups?limit=50`)).data
for (const g of groups.filter((g) => g.attributes.isInternalGroup)) {
  if (g.attributes.hasAccessToAllBuilds) { console.log(`in "${g.attributes.name}" (every build)`); continue }
  try { await api('POST', `/v1/betaGroups/${g.id}/relationships/builds`, { data: [{ type: 'builds', id: build.id }] }); console.log(`added to "${g.attributes.name}"`) }
  catch (e) { console.log(`add to "${g.attributes.name}": ${e.message}`) }
}
const detail = (await api('GET', `/v1/builds/${build.id}/buildBetaDetail`)).data
console.log(`internal testing: ${detail?.attributes.internalBuildState ?? '?'}. Install from the TestFlight app on the phone.`)
