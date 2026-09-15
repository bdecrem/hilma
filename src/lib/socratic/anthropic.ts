import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

/**
 * One client for the tutor and the observer.
 *
 * SOC_PROFILE names an `ant auth login` profile (OAuth; the SDK refreshes
 * the token itself and bills the org you logged into). It takes precedence
 * over ANTHROPIC_API_KEY on purpose: with a profile set, the SDK ignores
 * the key entirely, so a stale key in .env.local can't shadow the login.
 * Production has no profile on disk and uses the key. Neither → fail loudly.
 */
export function getClient(): Anthropic {
  if (_client) return _client
  const profile = process.env.SOC_PROFILE
  if (profile) {
    _client = new Anthropic({ profile })
  } else {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('Set SOC_PROFILE (an `ant auth login` profile) or ANTHROPIC_API_KEY')
    _client = new Anthropic({ apiKey })
  }
  return _client
}
