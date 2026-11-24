import { ogSize, sheetOg } from '../og'

export const size = ogSize
export const contentType = 'image/png'
export const alt = 'Setting up Claude, for the CASBS seminar on December 2'

export default function OgImage() {
  return sheetOg({
    kicker: 'The Seminar · December 2',
    title: 'Setting up Claude',
    say: 'Continue with SSO.',
  })
}
