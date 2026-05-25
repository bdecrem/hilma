import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/f2/auth'
import Shell from './Shell'
import FeyndThemeProvider from './FeyndThemeProvider'
import '../feynd-tokens.css'

export const dynamic = 'force-dynamic'

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()
  if (!user) redirect('/f2/login')

  return (
    <FeyndThemeProvider>
      <Shell username={user.username}>{children}</Shell>
    </FeyndThemeProvider>
  )
}
