import Link from 'next/link'
import { parseCore } from '@/lib/osai/core'
import { coreMarkdown } from '@/lib/osai/content'
import CoreDoc from '../CoreDoc'

export const dynamic = 'force-dynamic'

export default function MemoPage() {
  const doc = parseCore(coreMarkdown())
  return (
    <>
      <CoreDoc doc={doc} />
      <Link href="/osai/overview" className="osai-landscape">
        <span className="emoji" aria-hidden="true">🚧</span>
        <span className="t">
          <strong>Landscape.</strong> The public-benefit AI map: eight kinds of work, ranked by room left. Under construction.
        </span>
        <span className="go">Open →</span>
      </Link>
    </>
  )
}
