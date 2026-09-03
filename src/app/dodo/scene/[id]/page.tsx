import type { Metadata } from 'next'
import SceneExport from '../SceneExport'
import type { Format, Layer } from '../../DodoFrame'

// /dodo/scene/<id>?format=appstore-6.9|appstore-6.5|story|story-title|story-outro|card|wide|strip&theme=light|dark&layer=all|bg|bird
// The export surface behind `pnpm dodo:export` — one showcase frame at
// exact pixel size. Not linked from anywhere; not for humans.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Dodo scene', robots: { index: false, follow: false } }

export default async function ScenePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const sp = await searchParams
  const format = (typeof sp.format === 'string' ? sp.format : 'appstore-6.9') as Format
  const theme = sp.theme === 'dark' ? 'dark' : 'light'
  const layer = (sp.layer === 'bg' || sp.layer === 'bird' ? sp.layer : 'all') as Layer
  return <SceneExport id={id} format={format} theme={theme} layer={layer} />
}
