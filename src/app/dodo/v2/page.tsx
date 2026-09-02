import DodoHome from '../page'

// Local-only variant of the dodo.foo homepage: the masthead tile goes from
// icon peach to the bird's own deep slate. Same page underneath — only the
// `.da-mini` tile is restyled. `?tile=34505F&size=26` lets you try other
// hexes / tile sizes while iterating.

const DEFAULT_TILE = '34505F'
const DEFAULT_SIZE = 30

export default async function DodoV2Page({
  searchParams,
}: {
  searchParams: Promise<{ tile?: string; size?: string }>
}) {
  const sp = await searchParams
  const tile = /^[0-9a-fA-F]{6}$/.test(sp.tile ?? '') ? sp.tile! : DEFAULT_TILE
  const size = Number(sp.size) >= 18 && Number(sp.size) <= 40 ? Number(sp.size) : DEFAULT_SIZE
  return (
    <div className="da-v2" style={{ ['--tile' as string]: `#${tile}`, ['--tile-size' as string]: `${size}px` }}>
      <style>{override}</style>
      <DodoHome />
    </div>
  )
}

const override = `
.da-v2 .da-mini {
  background: var(--tile);
  width: var(--tile-size); height: var(--tile-size);
  border-radius: calc(var(--tile-size) * 0.224);
}
.da-v2 .da-mini svg { width: var(--tile-size); height: var(--tile-size); }
`
