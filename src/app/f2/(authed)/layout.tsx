import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/f2/auth'
import Shell from './Shell'

export const dynamic = 'force-dynamic'

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()
  if (!user) redirect('/f2/login')

  // FeyndThemeProvider + tokens come from /f2/layout.tsx now so login,
  // signup, and the authed shell all share the same light/dark vocabulary.
  return (
    <Shell
      username={user.username}
      initialAvatarUrl={user.avatar_url}
    >
      {children}
    </Shell>
  )
}
