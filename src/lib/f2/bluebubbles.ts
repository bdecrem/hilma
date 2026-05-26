// BlueBubbles adapter: outbound sender + inbound webhook auth.
// BlueBubbles Server runs on Bart's Mac mini, reachable at https://bart-mini.tunn3l.sh.

// Sending a fresh iMessage via AppleScript can take 10–15 seconds end-to-end
// (Tunn3l hop + AppleScript boot + Messages.app delivery). 8s was too tight
// and was reliably timing out even when delivery actually succeeded.
const BB_TIMEOUT_MS = 25000

function bbBase(): string {
  const u = process.env.BLUEBUBBLES_URL
  if (!u) throw new Error('BLUEBUBBLES_URL is not set')
  return u.replace(/\/$/, '')
}

function bbPassword(): string {
  const p = process.env.BLUEBUBBLES_PASSWORD
  if (!p) throw new Error('BLUEBUBBLES_PASSWORD is not set')
  return p
}

export type SendArgs =
  | { chatGuid: string; text: string }
  | { addresses: string[]; text: string }

export async function sendIMessage(args: SendArgs): Promise<void> {
  const base = bbBase()
  const password = bbPassword()
  const tempGuid = crypto.randomUUID()

  if ('chatGuid' in args) {
    const res = await fetch(
      `${base}/api/v1/message/text?password=${encodeURIComponent(password)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatGuid: args.chatGuid,
          tempGuid,
          message: args.text,
          method: 'apple-script',
        }),
        signal: AbortSignal.timeout(BB_TIMEOUT_MS),
      },
    )
    if (!res.ok) {
      throw new Error(`BlueBubbles send failed (${res.status}): ${await res.text()}`)
    }
    return
  }

  const res = await fetch(
    `${base}/api/v1/chat/new?password=${encodeURIComponent(password)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        addresses: args.addresses,
        message: args.text,
        service: 'iMessage',
      }),
      signal: AbortSignal.timeout(BB_TIMEOUT_MS),
    },
  )
  if (!res.ok) {
    throw new Error(`BlueBubbles new-chat failed (${res.status}): ${await res.text()}`)
  }
}

// BlueBubbles doesn't sign its webhook payloads, so we require a shared
// secret in the query string (or X-Webhook-Secret header).
export function authWebhook(req: Request):
  | { ok: true }
  | { ok: false; status: number; error: string } {
  const secret = process.env.BLUEBUBBLES_WEBHOOK_SECRET
  if (!secret) return { ok: false, status: 500, error: 'Server not configured' }
  const url = new URL(req.url)
  const got =
    url.searchParams.get('secret') ||
    req.headers.get('x-webhook-secret') ||
    ''
  if (got !== secret) return { ok: false, status: 401, error: 'Unauthorized' }
  return { ok: true }
}
