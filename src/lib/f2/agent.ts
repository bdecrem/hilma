// Client-agnostic core entrypoint for F2.
// Every client (iMessage, web, iOS) routes inbound messages through processMessage.
// This stub just echoes — real agentic loop replaces it.

export type F2Client = 'imessage' | 'web' | 'ios'

export type F2Message = {
  handle: string
  text: string
  client: F2Client
}

export type F2Reply = {
  reply: string
}

export async function processMessage(input: F2Message): Promise<F2Reply> {
  return { reply: `f2 got [${input.client}/${input.handle}]: ${input.text}` }
}
