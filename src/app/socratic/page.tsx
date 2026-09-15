import { Suspense } from 'react'
import { ARM_INFO } from '@/lib/socratic/arms'
import { DEFAULT_MODULE, listModules, moduleInfo } from '@/lib/socratic/modules'
import Start from './Start'

export const dynamic = 'force-dynamic'

export default async function SocraticPage() {
  const modules = (await listModules()).map(moduleInfo)
  return (
    <Suspense>
      <Start modules={modules} defaultModule={DEFAULT_MODULE} arms={ARM_INFO} />
    </Suspense>
  )
}
