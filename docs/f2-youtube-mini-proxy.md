# F2 YouTube transcript proxy on the Mac mini

Goal: let F2 in production (Vercel at feynd.cc) fetch YouTube transcripts.

The problem: YouTube returns empty responses to datacenter IP ranges (Vercel, AWS, GCP). The `youtube-transcript` npm package works fine — but only when the caller's source IP is residential. On Vercel it silently returns nothing and our ingest falls back to scraping the watch page, which is just chrome ("About Press Copyright Contact us …"), useless for learning.

The fix: route the YouTube fetch through a small endpoint on the Mac mini. The mini sits on home internet (residential IP) and is already running 24/7 for the iMessage bridge, so this is incremental — not net new infrastructure.

This is the same architectural tradeoff we already accept for iMessage: when the mini is off or offline, the feature degrades. For YouTube specifically, the fallback is the same "HTML chrome" behavior we have today — no worse than the status quo.

## Current state on the mini

Confirmed via ssh on 2026-05-24:

- **Repo:** `~/Documents/code/hilma` (note: `code`, not `coding2025`). Last commit on disk is `35c8a57` (handoff note). Pull latest before doing anything else.
- **Node:** `/opt/homebrew/bin/node` (Homebrew). Not on the default non-login ssh PATH, so plists must use the absolute path or set PATH explicitly.
- **Next.js server already running on `:3000`** — `next-server (v15.5.14)`, presumably from this same repo. Means someone already does a `pnpm build && pnpm start` (or similar) on this machine. We can add an API route to the Next app and it'll be served by whatever's running on `:3000`.
- **iMessage bridge launchd agent:** `~/Library/LaunchAgents/sh.f2.bridge.plist` runs `/opt/homebrew/bin/node ~/Documents/code/hilma/scripts/f2-imessage-bridge.mjs` (PID 79846 currently, KeepAlive=true).
- **Tunn3l launchd agent:** `~/Library/LaunchAgents/sh.tunn3l.bart-mini.plist` runs `tunn3l http 1234`. So `bart-mini.tunn3l.sh` currently forwards to **port 1234** (BlueBubbles), not 3000. We need a second tunnel for the Next server.
- **Reserved tunn3l subdomains** (from `tunn3l status` on the iMac): `bart-neo.tunn3l.sh`, `bart-mini.tunn3l.sh`, `bart-imacm1.tunn3l.sh`, `bart-imac.tunn3l.sh`. Any unused one can be repurposed; alternatively reserve a new one like `f2-mini.tunn3l.sh`.

## What's already in the codebase

`src/lib/f2/url.ts` has:

- `extractYouTubeVideoId(url)` — covers `watch?v=`, `youtu.be/`, `shorts/`, `embed/`, `m.youtube.com/`.
- `fetchYouTubeTranscript(videoId)` — currently calls the `youtube-transcript` package directly. Returns `null` on datacenter IPs (i.e. on Vercel). Falls through to HTML extraction.

`package.json` already has `youtube-transcript` as a dep. No new npm installs at the application layer.

What got removed (after the failed iMac-proxy attempt): the proxy dispatch logic and the `/api/f2/youtube-transcript` endpoint. Both need to be re-added — same shape as before, just pointed at the mini instead of the iMac this time.

## What to build

### 1. Add the API route on the mini's Next app

Restore `src/app/api/f2/youtube-transcript/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { fetchYouTubeTranscriptLocal } from '@/lib/f2/url'

export const runtime = 'nodejs'
export const maxDuration = 30

// GET /api/f2/youtube-transcript?v=<videoId>
// Header: X-F2-Secret: <F2_YOUTUBE_FETCH_SECRET>
//
// Runs on the Mac mini (reached via the tunn3l subdomain) so Vercel
// can borrow a residential IP for YouTube transcript fetches.
export async function GET(req: Request) {
  const expected = process.env.F2_YOUTUBE_FETCH_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'proxy not configured' }, { status: 503 })
  }
  const secret = req.headers.get('x-f2-secret')
  if (secret !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const v = new URL(req.url).searchParams.get('v')?.trim()
  if (!v) {
    return NextResponse.json({ error: 'v required' }, { status: 400 })
  }

  const text = await fetchYouTubeTranscriptLocal(v)
  if (!text) {
    return NextResponse.json({ error: 'no transcript' }, { status: 404 })
  }
  return NextResponse.json({ text, length: text.length })
}
```

### 2. Add the proxy dispatch in `src/lib/f2/url.ts`

Split into two exported functions:

- `fetchYouTubeTranscriptLocal(videoId)` — what's there today; calls the `youtube-transcript` package. Imported by the API route.
- `fetchYouTubeTranscript(videoId)` — top-level dispatcher: if `F2_YOUTUBE_FETCH_URL` env var is set, call the proxy with `X-F2-Secret` header; else fall through to `fetchYouTubeTranscriptLocal`.

```ts
export async function fetchYouTubeTranscript(
  videoId: string,
): Promise<string | null> {
  const proxyBase = process.env.F2_YOUTUBE_FETCH_URL?.replace(/\/$/, '')
  if (!proxyBase) {
    return fetchYouTubeTranscriptLocal(videoId)
  }

  const secret = process.env.F2_YOUTUBE_FETCH_SECRET ?? ''
  if (!secret) {
    console.error('[f2] F2_YOUTUBE_FETCH_URL set but F2_YOUTUBE_FETCH_SECRET missing')
    return null
  }

  try {
    const res = await fetch(
      `${proxyBase}/api/f2/youtube-transcript?v=${encodeURIComponent(videoId)}`,
      {
        headers: { 'x-f2-secret': secret },
        signal: AbortSignal.timeout(15000),
      },
    )
    if (!res.ok) {
      console.error(`[f2] YouTube proxy ${proxyBase} → ${res.status}`)
      return null
    }
    const data = (await res.json()) as { text?: string; error?: string }
    return data.text?.trim() || null
  } catch (err) {
    console.error(`[f2] YouTube proxy error:`, err)
    return null
  }
}
```

`fetchUrlContent` already calls `fetchYouTubeTranscript` — no changes needed there.

### 3. Configure the mini

Three pieces:

**a) Pull + restart the Next server.** Whatever runs the existing `:3000` instance needs to pick up the new route and the `F2_YOUTUBE_FETCH_SECRET` env var.

```bash
cd ~/Documents/code/hilma
git pull
pnpm install          # picks up youtube-transcript if not already installed
pnpm build            # if running production mode
# restart however the existing :3000 instance is managed
```

Add to whatever `.env.local` (or env-loading mechanism) the `:3000` server uses:

```bash
F2_YOUTUBE_FETCH_SECRET=<32-byte hex secret>
```

(Generate the secret on the iMac so it can be the same on Vercel:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

**b) Add a second tunn3l tunnel pointing at `:3000`.** The existing `sh.tunn3l.bart-mini.plist` forwards to `:1234` (BlueBubbles); leave it alone.

Reserve a new subdomain on the iMac first (since the iMac is where the tunn3l API key lives — bart-mini is reserved but already in use):

```bash
# on the iMac
tunn3l reserve f2-mini    # or bart-neo if you prefer to reuse a reserved one
```

Then on the mini, copy the existing tunn3l plist and adjust:

```bash
# on the mini
cp ~/Library/LaunchAgents/sh.tunn3l.bart-mini.plist \
   ~/Library/LaunchAgents/sh.tunn3l.f2-mini.plist
```

Edit the new plist so:

- `Label` → `sh.tunn3l.f2-mini`
- `ProgramArguments` → `tunn3l http 3000 --subdomain f2-mini`
- `StandardOutPath` / `StandardErrorPath` → `tunnel-f2-mini.{out,err}.log`

Load it:

```bash
launchctl load ~/Library/LaunchAgents/sh.tunn3l.f2-mini.plist
```

Quick verify: `curl https://f2-mini.tunn3l.sh/api/f2/youtube-transcript?v=test` should return JSON `{"error":"unauthorized"}` with status 401 (no `X-F2-Secret` header). If you get an HTML 404, the route isn't deployed; if you get a 502, the tunnel can't reach `:3000`.

**c) Set Vercel env vars on the hilma project.**

```bash
# on the iMac (vercel CLI already linked to hilma)
echo "https://f2-mini.tunn3l.sh" | vercel env add F2_YOUTUBE_FETCH_URL production
echo "<the same secret>" | vercel env add F2_YOUTUBE_FETCH_SECRET production
```

Trigger a redeploy (env var changes don't auto-apply to running functions). Either push a tiny commit or use the Vercel dashboard "Redeploy" on the latest deployment.

## Verification

After everything is in place:

```bash
# 1) Proxy endpoint is reachable with secret
curl -s -H "X-F2-Secret: <secret>" \
  "https://f2-mini.tunn3l.sh/api/f2/youtube-transcript?v=UF8uR6Z6KLc" \
  | head -c 200
# expect: {"text":"[Music] this program is brought to you by Stanford University...","length":11964}

# 2) End-to-end via prod messages endpoint
# (after a fresh login that gives you a prod cookie)
URL='https://youtu.be/4D3hDmGhFhA?si=...'
curl -s -X POST https://feynd.cc/api/f2/messages \
  -H 'Content-Type: application/json' -b cookie.txt \
  -d "{\"text\":\"$URL\"}"
# expect: reply mentions a multi-thousand char count, not 179
```

Then check the row:

```bash
./scripts/db "select length(content) as bytes, left(content, 120) as preview \
  from f2_threads where url='<url>' order by created_at desc limit 1"
```

## Failure modes worth knowing

- **Mini offline / Next server down** → Vercel calls the proxy URL → 502/timeout → `fetchYouTubeTranscript` returns null → ingest falls back to HTML chrome. Same behavior as before this feature existed. No hard breakage.
- **Mini's `:3000` is on an old commit** → route returns HTML 404 instead of JSON 401 → `errorMessage` helper surfaces a clearer error in iOS. Re-pull on the mini.
- **Tunnel subdomain mismatch on Vercel** → 404 HTML. Fix the env var, redeploy.
- **`F2_YOUTUBE_FETCH_SECRET` mismatch between Vercel and mini** → proxy returns 401, ingest falls back to HTML. Verify both ends.
- **YouTube tightens further and even residential IPs get blocked** → `fetchYouTubeTranscriptLocal` starts returning null on the mini too. Visible in the mini's Next logs as `[f2] YouTube transcript fetch (local) failed`. At that point the next step is a paid third-party API (Supadata / SearchAPI), which the proxy code can be repointed at trivially.

## Rollback

If anything goes sideways, the fastest way to revert to "no YouTube transcripts but everything else working" is removing the two Vercel env vars. The dispatcher then falls through to `fetchYouTubeTranscriptLocal`, which returns null on Vercel, which falls through to HTML. No code rollback needed.

```bash
vercel env rm F2_YOUTUBE_FETCH_URL production --yes
vercel env rm F2_YOUTUBE_FETCH_SECRET production --yes
```

The tunnel and the mini's `:3000` route can be left in place; without the Vercel env var they sit dormant.
