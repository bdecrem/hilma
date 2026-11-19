import type { Metadata, Viewport } from 'next'

// The same head for every board page: private, never indexed, Kit's icon, the menu's grey as the
// phone's bar color.
export const meta = (title: string): Metadata => ({ title: `${title} · Ola`, robots: { index: false, follow: false }, icons: { icon: '/kochito/kit/kit-icon.png', apple: '/kochito/kit/kit-icon.png' } })
export const boardViewport: Viewport = { themeColor: '#f7f7f5', viewportFit: 'cover' }
