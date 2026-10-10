// Every text Dolly sends leaves through here, as an iMessage from the Mac
// mini (Dodo's sender, src/lib/f2/bluebubbles.ts — its outbound ledger is
// what keeps our own echoes out of the shared inbox). Test accounts
// (TEST_PHONES, fictional 555 numbers) get no texts at all: the checks sign
// them in with a minted cookie instead.
import { sendIMessage } from '@/lib/f2/bluebubbles'

export const TEST_PHONES = new Set(['+15555550102', '+15555550103'])

export function isTestPhone(phone: string): boolean {
  return TEST_PHONES.has(phone)
}

export async function sendText(phone: string, text: string): Promise<void> {
  if (isTestPhone(phone)) {
    console.log(`[dolly] (test phone, not sent) ${phone}: ${text}`)
    return
  }
  await sendIMessage({ addresses: [phone], text })
}
