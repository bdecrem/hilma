import { Slides } from '../_walk/Slides'

export default function Page() {
  return <Slides theme="arcade" title="Arcade" blurb="neon on deep space, a pixel parrot" others={[{ href: '/design/daily-call-candy', label: 'Candy' }, { href: '/design/daily-call-sticker', label: 'Sticker' }, { href: '/design/daily-call-v2', label: 'v2, the spec' }]} />
}
