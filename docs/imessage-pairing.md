# BlueBubbles ↔ F2 — iMessage pairing (Mac mini setup notes)

Audience: the agent running on the Mac mini that hosts the BlueBubbles
Server. This doc explains what changed on the Vercel side so we can keep the
two sides aligned. **No mandatory code changes on the Mac mini are required
for the new pairing flow** — the existing send + webhook plumbing already
covers everything. Read through to confirm.

## Background

Until 2026-05-26, every inbound iMessage that BlueBubbles forwarded was
mapped to a single F2 user (`bart`) via the `F2_DEFAULT_IMESSAGE_USER_ID`
env var on Vercel. Going forward we associate iMessage handles with the
user who proves ownership of the handle by typing a 6-digit confirmation
code into the app. Each user can pair multiple handles (e.g. phone +
iCloud email). **There is no fallback** — messages from unpaired handles
are silently dropped.

## The pairing flow

```
  iPhone/web app                Vercel                  Mac mini (BlueBubbles)
  ┌─────────────┐              ┌──────────────┐         ┌──────────────────────┐
  │ Profile →   │              │              │         │                      │
  │ Add iMessage│              │              │         │                      │
  │             │   POST       │              │         │                      │
  │             │ ───────────► │ /imessage/   │         │                      │
  │             │              │ start        │         │                      │
  │             │              │              │  POST   │ /api/v1/chat/new     │
  │             │              │ generate code│ ──────► │ (BlueBubbles sends   │
  │             │              │ store pending│         │  the iMessage from   │
  │             │              │ call BB send │         │  this Mac's account) │
  │             │ ◄─────────── │              │         │                      │
  │             │   { ok }     │              │         │ iMessage delivered   │
  │             │              │              │         │ to handle ───────────┼──►
  │             │              │              │         │                      │   user reads
  │             │              │              │         │                      │   the code
  │             │              │              │         │                      │
  │ user types  │   POST       │              │         │                      │
  │ the 6-digit │ ───────────► │ /imessage/   │         │                      │
  │ code        │              │ confirm      │         │                      │
  │             │              │ verify code  │         │                      │
  │             │              │ append handle│         │                      │
  │             │              │ to f2_users  │         │                      │
  │             │ ◄─────────── │              │         │                      │
  │             │   { ok }     │              │         │                      │
  └─────────────┘              └──────────────┘         └──────────────────────┘
```

## What the Mac mini needs to keep working

1. **BlueBubbles server is reachable from Vercel.** Currently exposed via
   Tunn3l at `https://bart-mini.tunn3l.sh`. The Vercel env vars
   `BLUEBUBBLES_URL` + `BLUEBUBBLES_PASSWORD` already point here.
2. **`POST /api/v1/chat/new` works.** This is the existing endpoint we call
   to start a fresh iMessage thread with a brand-new handle (the user might
   never have texted this Mac before). Our outbound send already uses it —
   see `src/lib/f2/bluebubbles.ts` `sendIMessage({ addresses: [...] })`.
   Confirm no firewall / rate limit changes on the Mac mini side.
3. **Webhook continues to POST to Vercel** at
   `https://feynd.cc/api/f2/clients/imessage/webhook?secret=<BLUEBUBBLES_WEBHOOK_SECRET>`
   on every `new-message`. No payload-shape change needed.

## What changed on the Vercel side

- **Schema** — migration `apps/f2/schema/012_f2_imessage_pairing.sql`:
  - `f2_users.imessage_handles text[]` — confirmed handles per user.
  - `f2_imessage_pending` table — per-user pending pairings with a 6-digit
    code and 10-minute expiry.
- **New API routes**:
  - `POST /api/f2/imessage/start` — generates code, stores pending,
    calls `sendIMessage({ addresses: [handle], text: "Your Feynd code is …" })`.
  - `POST /api/f2/imessage/confirm` — verifies code + binds handle.
  - `GET  /api/f2/imessage/handles` — lists user's confirmed handles.
  - `DELETE /api/f2/imessage/handles` — unbind.
- **Webhook lookup change** (`/api/f2/clients/imessage/webhook`):
  - Before: every inbound message was attributed to the
    `F2_DEFAULT_IMESSAGE_USER_ID` user.
  - Now: look up the sender's handle in `f2_users.imessage_handles`. If
    the handle is paired, the message routes to that user. **If not, the
    message is dropped.** No env-var fallback.
  - `F2_DEFAULT_IMESSAGE_USER_ID` is no longer read by the webhook and
    can be removed from Vercel project env.

## Handle format

Both client and server normalize handles the same way:

- **Phones**: digits with an optional leading `+`. Anything else is stripped.
  `(555) 123-4567` becomes `+15551234567` if the user typed the country
  code; otherwise `5551234567`. **Recommend the user include the `+CC`**
  prefix — BlueBubbles iMessage delivery is much more reliable with full
  E.164.
- **iCloud emails**: lowercased exactly as-is.

The webhook's incoming `data.handle.address` value should already match
this normalization for phones in `+CC` form; iCloud emails come through
lowercased. If you observe a mismatch on the Mac mini (e.g. BlueBubbles is
delivering handle in a different shape), capture an example and we'll
update `normalizeHandle()` in `src/lib/f2/imessage.ts`.

## Verifying end-to-end

From any signed-in F2 account:

1. Open Profile → tap **Add iMessage**.
2. Enter your number (or iCloud email).
3. Within a few seconds you should receive an iMessage from the Mac mini's
   Apple ID: "Your Feynd confirmation code is 123456. Expires in 10 minutes."
4. Type the code back into the app → it confirms → handle bound.
5. From that handle, send a message to the Mac mini's Apple ID — the bot
   should now reply scoped to *your* F2 account (your topics, your stars),
   not bart's.

## Operational notes

- **Rate limits**: the code generator gives ~1M possibilities; brute-force
  is not in scope. If abuse appears we'll add a per-IP rate limiter.
- **One-handle-per-user**: `/imessage/start` rejects with 409 if another
  account already owns the handle. To re-bind, the previous owner must
  remove it first via `DELETE /api/f2/imessage/handles`.
- **Unpaired handles are dropped silently** (no reply, logged as
  `dropped — unpaired handle`). Pair your handle in the app first.

## Where the code lives

| Concern | File |
|--|--|
| Outbound send (start a new chat) | `src/lib/f2/bluebubbles.ts` `sendIMessage()` |
| Webhook receive | `src/app/api/f2/clients/imessage/webhook/route.ts` |
| Pairing API routes | `src/app/api/f2/imessage/{start,confirm,handles}/route.ts` |
| Pairing logic + handle normalization | `src/lib/f2/imessage.ts` |
| iOS UI | `apps/feynd/Feynd/IMessagePairingView.swift` + ProfileSheet's iMessage section |
| Web UI | `src/app/f2/(authed)/WebProfileSheet.tsx` (iMessage section) |
| Schema | `apps/f2/schema/012_f2_imessage_pairing.sql` |
