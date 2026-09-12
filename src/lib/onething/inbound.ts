// Thin seam between Dodo's BlueBubbles webhook and Onething, so the webhook
// imports one small module and Onething's failures can never break Dodo.
import { findUserByPhone, handleInbound as core, normalizePhone } from './core'

export async function isOnethingChat(chatGuid: string): Promise<boolean> {
  try {
    const addr = chatGuid.split(';').pop() ?? ''
    const phone = addr.startsWith('+') ? normalizePhone(addr) : null
    return !!phone && !!(await findUserByPhone(phone))
  } catch (e) {
    console.error('[onething] chat lookup failed', e)
    return false
  }
}

export async function handleInbound(args: { handle: string; chatGuid: string; text: string }): Promise<boolean> {
  try {
    return await core(args)
  } catch (e) {
    console.error('[onething] inbound failed', e)
    return false
  }
}
