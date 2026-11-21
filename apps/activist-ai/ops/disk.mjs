// Free disk, read before an update or a check starts (OLA-327): on Nov 20 the mini had 3.8 GB and an
// update stopped half way; the fourth time its disk stopped work (OLA-59, OLA-122, OLA-135). The app
// builds read it too (apple/tools/build.sh, apple/testflight/ship-via-mini.sh).
import { statfsSync } from 'node:fs'

/** What an update or a check needs: a release's unpack, npm ci, the web build, the image, the suites. */
export const UPDATE_NEEDS_GB = 10

/** Free space on the data volume, in GB (1024^3 bytes). */
export function freeGB(dir = '/System/Volumes/Data') {
  for (const d of [dir, '/']) {
    try {
      const s = statfsSync(d)
      return (s.bavail * s.bsize) / 1024 ** 3
    } catch {}
  }
  return null
}

/** The refusal in one sentence when there is too little, else null. An unreadable disk is not refused. */
export function diskRefusal(free, { need = UPDATE_NEEDS_GB, what = 'an update' } = {}) {
  if (free == null || free >= need) return null
  return `${what} needs ${need} GB free and this machine has ${free.toFixed(1)} GB: not started (free some first: old builds, DerivedData, logs; OLA-327)`
}
