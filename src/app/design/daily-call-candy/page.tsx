import { Slides } from '../_walk/Slides'

export default function Page() {
  return <Slides theme="candy" title="Candy" blurb="pastel sky, jelly buttons, a gummy parrot" others={[{ href: '/design/daily-call-arcade', label: 'Arcade' }, { href: '/design/daily-call-sticker', label: 'Sticker' }, { href: '/design/daily-call-v2', label: 'v2, the spec' }]} />
}
