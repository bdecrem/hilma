import { Suspense } from 'react'
import { ARM_INFO } from '@/lib/socratic/arms'
import { DEFAULT_MODULE, getModule } from '@/lib/socratic/modules'
import Start from './Start'

export default function SocraticPage() {
  const m = getModule(DEFAULT_MODULE)!
  return (
    <Suspense>
      <Start
        module={{ id: m.id, title: m.title, subtitle: m.subtitle, course: m.course, source: m.source }}
        arms={ARM_INFO}
      />
    </Suspense>
  )
}
