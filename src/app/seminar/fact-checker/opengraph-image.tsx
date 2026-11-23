import content from './content.json'
import { ogSize, sheetOg } from '../og'

export const size = ogSize
export const contentType = 'image/png'
export const alt = 'Your own fact checker: a skill by John Markoff for Claude'

export default function OgImage() {
  return sheetOg({ kicker: content.kicker, title: content.title, say: 'Fact-check chapter 3.' })
}
