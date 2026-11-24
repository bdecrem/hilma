import { ogSize, sheetOg } from '../og'

export const size = ogSize
export const contentType = 'image/png'
export const alt = 'Roll your own: tips for building with Claude, for the CASBS seminar on December 2'

export default function OgImage() {
  return sheetOg({
    kicker: 'The Seminar · December 2',
    title: 'Roll your own',
    say: 'Want a thing made? Code.',
  })
}
