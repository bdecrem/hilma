import { Slides } from '../_walk/Slides'

export default function Page() {
  return <Slides theme="sticker" title="Sticker" blurb="zine white, fat outlines, die-cut stickers" others={[{ href: '/design/daily-call-arcade', label: 'Arcade' }, { href: '/design/daily-call-candy', label: 'Candy' }, { href: '/design/daily-call-v2', label: 'v2, the spec' }]} />
}
