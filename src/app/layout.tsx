import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hilma',
  description: 'Hilma',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
