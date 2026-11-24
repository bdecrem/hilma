import content from './content.json'
import { ogSize, sheetOg } from '../og'

export const size = ogSize
export const contentType = 'image/png'
export const alt = 'Get your free Claude account, for the CASBS seminar on December 2'

export default function OgImage() {
  return sheetOg({
    kicker: content.kicker,
    title: content.titleBefore + content.titleEmph + content.titleAfter,
    say: 'Continue with SSO.',
  })
}
