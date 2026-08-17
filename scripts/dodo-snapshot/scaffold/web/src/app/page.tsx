import { redirect } from 'next/navigation'

// The web client lives at /f2 (the iOS app hits /api/f2/*).
export default function Home() {
  redirect('/f2')
}
