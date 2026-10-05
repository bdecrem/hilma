import { resources } from '@/lib/osai/content'
import Resources from './Resources'

export const dynamic = 'force-dynamic'

export default function ResourcesPage() {
  return <Resources items={resources()} />
}
