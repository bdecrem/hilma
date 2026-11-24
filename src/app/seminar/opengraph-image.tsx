import home from './home.json'
import { ogSize, sheetOg } from './og'

export const size = ogSize
export const contentType = 'image/png'
export const alt = 'The Seminar: three things to build with Claude'

export default function OgImage() {
  return sheetOg({ kicker: home.kicker, title: 'The Seminar', say: 'Hi Claude.' })
}
