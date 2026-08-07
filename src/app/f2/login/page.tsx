import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/f2/auth'
import LoginForm from './LoginForm'
import AuthShell from '../auth/AuthShell'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const user = await getSessionUser()
  if (user) redirect('/f2')

  return (
    <AuthShell title="dodo" tagline="Learn anything.">
      <LoginForm />
    </AuthShell>
  )
}
