/**
 * amber-tweet.ts — Generate a tweet using hilma-writer and post it as @intheamber.
 *
 * Usage: pnpm tsx scripts/amber-tweet.ts [--dry-run]
 *
 * Requires: Ollama running locally with hilma-writer-q4 model.
 * Env: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_INTHEAMBER_ACCESS_TOKEN, TWITTER_INTHEAMBER_ACCESS_SECRET
 */

import crypto from 'crypto'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const DRY_RUN = process.argv.includes('--dry-run')

// --- Ollama ---

async function generate(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'hilma-writer-q4',
      prompt,
      stream: false,
      options: { temperature: 1.1, top_p: 0.95, top_k: 80, num_predict: 120 },
    }),
  })
  if (!res.ok) throw new Error(`Ollama error: ${await res.text()}`)
  const data = await res.json()
  return (data.response as string).trim()
}

// --- Twitter OAuth 1.0a ---

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function hmacSha1(key: string, data: string): string {
  return crypto.createHmac('sha1', key).update(data).digest('base64')
}

function oauthSign(method: string, url: string, params: Record<string, string>): string {
  const apiKey = process.env.TWITTER_API_KEY!
  const apiSecret = process.env.TWITTER_API_SECRET!
  const accessToken = process.env.TWITTER_INTHEAMBER_ACCESS_TOKEN!
  const accessSecret = process.env.TWITTER_INTHEAMBER_ACCESS_SECRET!

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  }

  const allParams = { ...params, ...oauthParams }
  const paramString = Object.keys(allParams)
    .sort()
    .map(k => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join('&')

  const baseString = `${method}&${percentEncode(url)}&${percentEncode(paramString)}`
  const signingKey = `${percentEncode(apiSecret)}&${percentEncode(accessSecret)}`
  oauthParams.oauth_signature = hmacSha1(signingKey, baseString)

  const header = Object.keys(oauthParams)
    .sort()
    .map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(', ')

  return `OAuth ${header}`
}

async function postTweet(text: string): Promise<{ id: string; text: string }> {
  const url = 'https://api.twitter.com/2/tweets'
  const body = JSON.stringify({ text })
  const auth = oauthSign('POST', url, {})

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Twitter API error ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.data
}

// --- Main ---

const PROMPTS = [
  'The morning light fell across',
  'She remembered the sound of',
  'In the silence between breaths',
  'The city never truly sleeps because',
  'He opened the door and found',
  'Somewhere between waking and dreaming',
  'The last thing she expected was',
  'Rain on the window reminded him of',
  'At the edge of the world there is',
  'The old house still held the smell of',
  'Time moved differently here because',
  'Her hands knew things her mind had forgotten about',
  'The letter arrived on a Tuesday and said',
  'Below the surface of the water',
  'What the map didn\'t show was',
]

async function main() {
  // Pick a random prompt
  const prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]
  console.log(`Prompt: "${prompt}"`)

  // Generate raw text
  const raw = await generate(prompt)
  console.log(`Raw output: "${raw}"`)

  // Take the prompt + first complete sentence(s) that fit in 280 chars
  // Clean up spacing around punctuation
  const full = (prompt + ' ' + raw).replace(/\s+([,;:.])/g, '$1')
  // Find sentence boundaries
  const sentences = full.match(/[^.!?]+[.!?]+/g) || [full]
  let tweet = ''
  for (const s of sentences) {
    if ((tweet + s).length <= 280) {
      tweet += s
    } else break
  }
  tweet = tweet.trim()
  if (!tweet) tweet = full.slice(0, 277) + '...'

  console.log(`\nTweet (${tweet.length} chars):\n${tweet}\n`)

  if (DRY_RUN) {
    console.log('[dry run — not posting]')
    return
  }

  const result = await postTweet(tweet)
  console.log(`Posted! https://twitter.com/intheamber/status/${result.id}`)
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
