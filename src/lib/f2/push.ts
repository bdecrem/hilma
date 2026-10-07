// Push notifications for Dodo (APNs). Device tokens are registered by the app
// (POST /api/f2/push/register) into f2_push_tokens; the server sends with a
// team-wide APNs auth key over HTTP/2.
//
// Env (Vercel + .env.local): APNS_KEY_P8 (the .p8 contents; "\n" escapes are
// accepted), APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID (com.bartdecrem.Feynd).
// Each token carries its own environment — Debug builds register sandbox
// tokens, TestFlight / App Store builds production ones — so both gateways
// are used side by side. Ported from crashapp's server/lib/apns.ts without
// the jose dependency (node:crypto signs ES256 directly).
import { connect as http2Connect, constants as h2 } from 'node:http2'
import { createPrivateKey, sign as cryptoSign } from 'node:crypto'
import { f2Supabase } from './supabase'

export type PushEnvironment = 'sandbox' | 'production'

type ApnsConfig = { key: ReturnType<typeof createPrivateKey>; keyId: string; teamId: string; bundleId: string }

let _config: ApnsConfig | null | undefined
function config(): ApnsConfig | null {
  if (_config !== undefined) return _config
  const p8 = process.env.APNS_KEY_P8
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  const bundleId = process.env.APNS_BUNDLE_ID
  if (!p8 || !keyId || !teamId || !bundleId) {
    _config = null
    return null
  }
  _config = { key: createPrivateKey(p8.replace(/\\n/g, '\n')), keyId, teamId, bundleId }
  return _config
}

export function pushConfigured(): boolean {
  return config() != null
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')
let _jwt: { token: string; at: number } | null = null
/** Provider token: ES256, reused for 50 minutes (Apple refuses one older than an hour). */
function providerToken(cfg: ApnsConfig): string {
  const now = Date.now()
  if (_jwt && now - _jwt.at < 50 * 60 * 1000) return _jwt.token
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }))
  const claims = b64url(JSON.stringify({ iss: cfg.teamId, iat: Math.floor(now / 1000) }))
  const sig = cryptoSign('sha256', Buffer.from(`${head}.${claims}`), { key: cfg.key, dsaEncoding: 'ieee-p1363' })
  _jwt = { token: `${head}.${claims}.${b64url(sig)}`, at: now }
  return _jwt.token
}

export type PushMessage = {
  title: string
  body: string
  /** Notification category: the app registers actions per category. */
  category?: string
  /** A newer push with the same collapse id replaces the older one on the device. */
  collapseId?: string
  /** Groups notifications in Notification Center. */
  threadId?: string
  /** Custom keys next to `aps` (routing data for the app). */
  data?: Record<string, unknown>
}

export type PushResult = { ok: boolean; status: number; reason?: string }

/** Send one notification to one device token. APNs only speaks HTTP/2. */
export async function sendApns(token: string, environment: PushEnvironment, msg: PushMessage): Promise<PushResult> {
  const cfg = config()
  if (!cfg) return { ok: false, status: 0, reason: 'apns-not-configured' }
  const host = environment === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'
  const body = JSON.stringify({
    aps: {
      alert: { title: msg.title, body: msg.body },
      sound: 'default',
      ...(msg.category ? { category: msg.category } : {}),
      ...(msg.threadId ? { 'thread-id': msg.threadId } : {}),
    },
    ...(msg.data ?? {}),
  })
  const headers: Record<string, string> = {
    authorization: `bearer ${providerToken(cfg)}`,
    'apns-topic': cfg.bundleId,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'content-type': 'application/json',
  }
  if (msg.collapseId) headers['apns-collapse-id'] = msg.collapseId

  const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const session = http2Connect(`https://${host}`)
    const done = () => { try { session.close() } catch {} }
    const timer = setTimeout(() => { done(); reject(new Error('apns timeout after 10s')) }, 10_000)
    session.on('error', (e) => { clearTimeout(timer); done(); reject(e) })
    const req = session.request({ [h2.HTTP2_HEADER_METHOD]: 'POST', [h2.HTTP2_HEADER_PATH]: `/3/device/${token}`, ...headers })
    let status = 0
    let text = ''
    req.setEncoding('utf8')
    req.on('response', (h) => { status = Number(h[h2.HTTP2_HEADER_STATUS]) || 0 })
    req.on('data', (c) => { text += c })
    req.on('end', () => { clearTimeout(timer); done(); resolve({ status, body: text }) })
    req.on('error', (e) => { clearTimeout(timer); done(); reject(e) })
    req.end(body)
  }).catch((e: unknown) => ({ status: -1, body: JSON.stringify({ reason: e instanceof Error ? e.message : String(e) }) }))

  if (res.status === 200) return { ok: true, status: 200 }
  let reason: string | undefined
  try { reason = (JSON.parse(res.body) as { reason?: string }).reason } catch { reason = res.body.slice(0, 200) || undefined }
  return { ok: false, status: res.status, reason }
}

/** Reasons that mean the token will never work again. */
const DEAD = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'])

/** Send to every live token of a user. Dead tokens are disabled on the way. */
export async function sendPushToUser(userId: string, msg: PushMessage): Promise<{ sent: number; failed: { token: string; status: number; reason?: string }[] }> {
  const { data, error } = await f2Supabase()
    .from('f2_push_tokens')
    .select('token, environment')
    .eq('user_id', userId)
    .is('disabled_at', null)
  if (error) throw new Error(`push token lookup failed: ${error.message}`)
  let sent = 0
  const failed: { token: string; status: number; reason?: string }[] = []
  for (const row of (data ?? []) as { token: string; environment: PushEnvironment }[]) {
    const r = await sendApns(row.token, row.environment, msg)
    if (r.ok) { sent++; continue }
    failed.push({ token: row.token.slice(0, 8), status: r.status, reason: r.reason })
    if (r.status === 410 || DEAD.has(r.reason ?? '')) {
      await f2Supabase().from('f2_push_tokens').update({ disabled_at: new Date().toISOString() }).eq('token', row.token)
    }
  }
  return { sent, failed }
}

/** Users with at least one live token. */
export async function usersWithPush(): Promise<Set<string>> {
  const { data, error } = await f2Supabase().from('f2_push_tokens').select('user_id').is('disabled_at', null)
  if (error) throw new Error(`push token lookup failed: ${error.message}`)
  return new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id))
}

/** Register (or move) a device token to this user. */
export async function registerPushToken(userId: string, token: string, environment: PushEnvironment, bundleId: string): Promise<void> {
  const { error } = await f2Supabase().from('f2_push_tokens').upsert(
    { token, user_id: userId, environment, bundle_id: bundleId, updated_at: new Date().toISOString(), disabled_at: null },
    { onConflict: 'token' },
  )
  if (error) throw new Error(`push token upsert failed: ${error.message}`)
}

export async function unregisterPushToken(userId: string, token: string): Promise<void> {
  await f2Supabase().from('f2_push_tokens').delete().eq('token', token).eq('user_id', userId)
}
