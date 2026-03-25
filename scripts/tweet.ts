/**
 * tweet.ts — Post a tweet as @intheamber.
 *
 * Usage: npx tsx scripts/tweet.ts "your tweet text here"
 *
 * Env: TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_INTHEAMBER_ACCESS_TOKEN, TWITTER_INTHEAMBER_ACCESS_SECRET
 */

import crypto from 'crypto'

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

const text = process.argv[2]
if (!text) {
  console.error('Usage: npx tsx scripts/tweet.ts "tweet text"')
  process.exit(1)
}

postTweet(text).then(result => {
  console.log(`Posted! https://twitter.com/intheamber/status/${result.id}`)
}).catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
