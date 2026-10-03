import { parseCore } from '@/lib/osai/core'
import { coreMarkdown, coreStamp } from '@/lib/osai/content'
import CoreDoc from './CoreDoc'

export const dynamic = 'force-dynamic'

export default function CorePage() {
  const doc = parseCore(coreMarkdown())
  return <CoreDoc doc={doc} stamp={coreStamp()} />
}
