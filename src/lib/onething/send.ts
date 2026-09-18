// Every text Onething sends leaves through here. Real numbers go out as
// iMessages; the demo number's texts (sign-in code, welcome, the daily
// question, the reminder) go to Bart's own phone instead, marked "[demo]", so
// a demo account works end to end without a phone that can receive iMessages.
// (Email was the first choice — SendGrid is out of credit, 2026-09-18.)
// Nothing else knows the difference.

import { sendIMessage, type SendArgs } from '@/lib/f2/bluebubbles'
import { BART } from './notify'

/// (555) 555-0101 — a fictional number, typed into the sign-in form for demos.
export const DEMO_PHONES = new Set(['+15555550101'])
export const DEMO_PREFIX = '[demo] '

export function isDemoPhone(phone: string): boolean {
  return DEMO_PHONES.has(phone)
}

export async function sendText(args: SendArgs): Promise<void> {
  const to = 'addresses' in args ? args.addresses[0] : undefined
  if (to && isDemoPhone(to)) {
    await sendIMessage({ addresses: [BART], text: `${DEMO_PREFIX}${args.text}` })
    return
  }
  await sendIMessage(args)
}
