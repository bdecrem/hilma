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

  return <Shell username={user.username}>{children}</Shell>
}
