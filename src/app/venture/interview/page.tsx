import Call from '../Call'
import { FOUNDING } from '@/lib/venture/interview'

// The founding interview: a voice call where Claude asks Bart what it needs
// to know before picking and running a business. See src/lib/venture/interview.ts.
export default function Page() {
  return (
    <Call
      call={FOUNDING.slug}
      kicker="Venture · the founding interview"
      title={FOUNDING.title}
      blurb={FOUNDING.blurb}
      doneNote="The transcript is with me in the terminal. I’ll come back there with the business ideas."
    />
  )
}
