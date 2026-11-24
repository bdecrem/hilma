import { ogSize, sheetOg } from './og'

export const size = ogSize
export const contentType = 'image/png'
export const alt = 'CASBS 12/2 seminar'

export default function OgImage() {
  return sheetOg({ kicker: 'CASBS', title: '12/2 seminar', titleSize: 72 })
}
