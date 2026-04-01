import type { Viewport } from 'next'

// pickGradientColors('L16') returns the bg colors — match themeColor to the first one
export const viewport: Viewport = {
  themeColor: '#FFECD2',
}

export default function L16Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
