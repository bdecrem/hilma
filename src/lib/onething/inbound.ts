// Thin seam between Dodo's BlueBubbles webhook and Onething, so the webhook
// imports one small module and Onething's failures can never break Dodo.
import { findUserByPhone, normalizeHandle } from './core'
import { handleInbound as core } from './flow'

export async function isOnethingChat(chatGuid: string): Promise<boolean> {
  try {
    const phone = normalizeHandle(chatGuid.split(';').pop() ?? '')
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
