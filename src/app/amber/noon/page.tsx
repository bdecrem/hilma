import { redirect } from 'next/navigation'
import { todayDate } from './generator'

// /amber/noon → today's dated URL. Each day's piece lives at its own
// permanent URL: /amber/noon/YYYY-MM-DD.
export default function NoonIndex() {
  redirect(`/amber/noon/${todayDate()}`)
}
