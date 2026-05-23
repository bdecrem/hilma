import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/f2/auth'
import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const user = await getSessionUser()
  if (user) redirect('/f2')

  return (
    <main
      className="flex items-center justify-center min-h-[100dvh] bg-[#f7f7f5] text-neutral-900"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="w-full max-w-sm px-6 py-12">
        <h1 className="text-4xl font-semibold tracking-tight mb-1">F2</h1>
        <p className="text-neutral-500 mb-10">Learn anything.</p>
        <LoginForm />
      </div>
    </main>
  )
}
