import type { Viewport } from 'next'
import DossiersLayout from '../dossiers/layout'

// The hub for the Costa Rica dossier sits outside /mrd/dossiers but wears the same fonts and paper.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f1e8' },
    { media: '(prefers-color-scheme: dark)', color: '#14120e' },
  ],
}
export default DossiersLayout
