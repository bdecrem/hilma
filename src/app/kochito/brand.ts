import { headers } from 'next/headers'

// One set of pages, three front doors. kochitolabs.com is the company;
// clerkpdf.com and appadopt.com (bought 2026-11-14) are its two services on
// their own names. The host decides the name in the header and what the
// links point to; the pages themselves are the same.
export type Brand = { site: 'kochito' | 'clerkpdf' | 'appadopt'; name: string; home: string }

export async function brand(): Promise<Brand> {
  const host = ((await headers()).get('host') ?? '').replace(/^www\./, '').replace(/:\d+$/, '')
  if (host === 'clerkpdf.com') return { site: 'clerkpdf', name: 'ClerkPDF', home: '/' }
  if (host === 'appadopt.com') return { site: 'appadopt', name: 'AppAdopt', home: '/' }
  return { site: 'kochito', name: 'Kochito Labs', home: '/' }
}
