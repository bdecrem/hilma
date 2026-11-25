import { ogSize, sheetOg } from '../og'

export const size = ogSize
export const contentType = 'image/png'
export const alt = 'Make your idea playable, for the CASBS seminar on December 2'

export default function OgImage() {
  return sheetOg({ kicker: 'CASBS · 12/2 seminar', title: 'Make your idea playable', titleSize: 88 })
}
