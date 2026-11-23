import content from './content.json'
import { ogSize, sheetOg } from '../og'

export const size = ogSize
export const contentType = 'image/png'
export const alt = 'Build your own paper library: a step-by-step sheet for Claude Code'

export default function OgImage() {
  return sheetOg({ kicker: content.kicker, title: content.title, say: 'I want my own little library of papers.' })
}
