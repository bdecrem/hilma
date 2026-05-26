import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/f2/auth'
import SignupForm from './SignupForm'
import AuthShell from '../auth/AuthShell'

export const dynamic = 'force-dynamic'

export default async function SignupPage() {
  const user = await getSessionUser()
  if (user) redirect('/f2')

  return (
    <AuthShell title="Create account" tagline="Email and a password. That's it.">
      <SignupForm />
    </AuthShell>
  )
}
