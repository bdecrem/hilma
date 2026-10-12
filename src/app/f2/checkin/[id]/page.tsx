import { redirect } from 'next/navigation'

// https://feynd.cc/checkin/<topic id> is the Daily Voice Checkin link in the
// 5 pm text. With Dodo installed it opens the app (universal link, see
// /api/f2/aasa); everywhere else it lands on the topic's page.
export default async function CheckinRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/topics/${encodeURIComponent(id)}`)
}
