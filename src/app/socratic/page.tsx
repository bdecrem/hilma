import { Suspense } from 'react'
import { ARM_INFO } from '@/lib/socratic/arms'
import { allModules, DEFAULT_MODULE, listModules, moduleInfo } from '@/lib/socratic/modules'
import Start from './Start'

export const dynamic = 'force-dynamic'

/** The full build (every topic + the topic generator) runs on Bart's iMac behind tunn3l; the public page points there. */
const FULL_URL = process.env.SOC_FULL_URL || 'https://bart-imac.tunn3l.sh/socratic'

export default async function SocraticPage() {
  const full = allModules()
  const modules = (await listModules()).map(moduleInfo)
  return (
    <Suspense>
      <Start modules={modules} defaultModule={DEFAULT_MODULE} arms={ARM_INFO} canCreate={full} fullUrl={full ? null : FULL_URL} />
    </Suspense>
  )
}
