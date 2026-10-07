import { redirect } from 'next/navigation'

// https://feynd.cc/read/<topic id> is the Actively Read link in the daily
// text and push. With Dodo installed it opens the app (universal link, see
// /api/f2/aasa); everywhere else it lands on the topic's page.
export default async function ReadRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/topics/${encodeURIComponent(id)}`)
}
