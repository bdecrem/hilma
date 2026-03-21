# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Machines & Paths

### Local (iMac-2, Tailscale: 100.66.170.98) — my home machine
- **vibeceo repo:** `/Users/admin/Documents/code/vibeceo/`
- **OpenClaw agents:** `/Users/admin/.openclaw/agents/`
- **My workspace:** `/Users/admin/.openclaw/agents/amber/workspace/`
- User: `bartssh`

### Remote (iMac M1 aka "the M1", Tailscale: 100.94.183.69)
- **vibeceo repo:** `/Users/bart/Documents/code/vibeceo/`
- **SSH:** `ssh bart@100.94.183.69`
- User: `bart`

### MacBook Air (Tailscale: 100.64.134.96)
- User: `bartssh`

### Hume TTS (Voice)
- **Script:** `node ~/.openclaw/shared/hume-tts/hume-tts.mjs "text"`
- **Default voice:** `e5c30713-861d-476e-883a-fc0e1788f736`
- **Override:** `HUME_VOICE_ID=xxx HUME_DESCRIPTION="acting direction" node ...`
- **Important:** Uses direct REST API (not streaming SDK — streaming degrades quality)
- Send output mp3 via `message(action=send, filePath=...)` 

### Key Principle
- **OpenClaw admin tasks** (editing SOUL.md, agent configs) → agent workspace paths
- **App work** (vibeceo repo) → same repo exists on both machines, paths differ by machine

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

### Home Cameras

#### Camera 1: Tapo C560WS (Outdoor)
- **IP:** 192.168.7.23
- **Creds:** bartdecrem@gmail.com / pivMi9-bontas-jabjaf
- **Capabilities:** Fixed (no PTZ)
- **Snapshot:** `ffmpeg -rtsp_transport tcp -i "rtsp://bartdecrem%40gmail.com:pivMi9-bontas-jabjaf@192.168.7.23:554/stream1" -frames:v 1 -update 1 -y /tmp/outdoor.jpg`
- **Notes:** Mounted sideways between vases, images rotated ~90°

#### Camera 2: Reolink E1 Zoom (Living Room — Indoor PTZ)
- **IP:** 192.168.7.22
- **Creds:** admin / 8iguana61
- **Resolution:** 4K (3840x2160)
- **Capabilities:** Pan, tilt, 5x optical zoom, autofocus, presets (0-31)
- **Snapshot (RTSP):** `ffmpeg -rtsp_transport tcp -i "rtsp://admin:8iguana61@192.168.7.22:554/h264Preview_01_main" -frames:v 1 -update 1 -y /tmp/livingroom.jpg`
- **Snapshot (4K HTTPS):** Login for token, then `cmd=Snap&channel=0&token=$TOKEN`
- **Login:**
  ```
  TOKEN=$(curl -sk -X POST "https://192.168.7.22:443/cgi-bin/api.cgi?cmd=Login" \
    -H "Content-Type: application/json" \
    -d '[{"cmd":"Login","action":0,"param":{"User":{"userName":"admin","password":"8iguana61"}}}]' \
    | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['value']['Token']['name'])")
  ```
- **PTZ:** `cmd=PtzCtrl`, ops: Left/Right/Up/Down/LeftUp/LeftDown/RightUp/RightDown/Stop/ZoomInc/ZoomDec/AutoFocus, speed 1-64. **Always send Stop after moving.**
- **Presets:** `cmd=SetPtzPreset` (save), `cmd=PtzCtrl op=ToPos id=N` (recall), ids 0-31
- **Token expires after 1 hour** — re-login if needed

### Twitter Mentions & Replies
- **Read mentions:** `GET https://api.twitter.com/2/users/{userId}/mentions` with `since_id` cursor
- **Reply:** `POST https://api.twitter.com/2/tweets` with `reply.in_reply_to_tweet_id`
- **Get tweet:** `GET https://api.twitter.com/2/tweets/{tweetId}`
- **Search:** `GET https://api.twitter.com/2/tweets/search/recent`
- **Get user ID:** `GET https://api.twitter.com/2/users/me`
- **Upload media:** `POST https://upload.twitter.com/1.1/media/upload.json`
- **Auth:** OAuth 1.0a HMAC-SHA1 (manual, no SDK)
- **Env vars:** TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_INTHEAMBER_ACCESS_TOKEN, TWITTER_INTHEAMBER_ACCESS_SECRET (all in sms-bot/.env.local)
- **Mention cursor:** Store last processed `since_id` in Supabase to avoid re-processing
- **Safety:** Never post to @bartdecrem (blocked). Whitelist for auto-replies, spam filter for the rest.
- **Script location:** `cd /Users/admin/Documents/code/vibeceo/sms-bot && node amber-tweet.mjs "text"` (posting only currently)

Add whatever helps you do your job. This is your cheat sheet.

## Current Machine: Mac mini (admin@admins-Mac-mini.local)
- **Tailscale:** 100.95.51.98
- **vibeceo repo:** `/Users/admin/Documents/code/vibeceo/`
- **claudio repo:** `/Users/admin/Documents/code/claudio/`
- **User:** admin
- **Password:** jkl;

## Twitter (@pixelpit_games)
Creds are in `~/.openclaw/openclaw.json` under `skills.entries.x-twitter.env`.
Use the `twclaw` CLI:
```bash
export TWITTER_BEARER_TOKEN="..." # from x-twitter skill
export TWITTER_API_KEY="..."
export TWITTER_API_SECRET="..."
export TWITTER_ACCESS_TOKEN="..."
export TWITTER_ACCESS_SECRET="..."
twclaw tweet "your tweet text"
```

Or use the kollektive-post script for @daskollektivrip:
```bash
cd ~/Documents/code/vibeceo && npx tsx sms-bot/scripts/kollektive-post.ts "text"
```
