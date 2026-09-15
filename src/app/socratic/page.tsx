import { Suspense } from 'react'
import { ARM_INFO } from '@/lib/socratic/arms'
import { DEFAULT_MODULE, MODULES } from '@/lib/socratic/modules'
import Start from './Start'

export default function SocraticPage() {
  const modules = Object.values(MODULES).map((m) => ({ id: m.id, title: m.title, subtitle: m.subtitle, course: m.course, source: m.source }))
  return (
    <Suspense>
      <Start modules={modules} defaultModule={DEFAULT_MODULE} arms={ARM_INFO} />
    </Suspense>
  )
}
