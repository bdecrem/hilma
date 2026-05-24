# Handoff: F2 iMessage backend broken after May 23 deploys

**Symptom:** As of ~2026-05-24 08:28 PT, F2 over iMessage stopped replying. Tested: URL ingest (`https://youtu.be/...`), chitchat (`Hi`). Neither gets a reply. Yesterday afternoon (pre-deploys) the same flow worked end-to-end.

## Bridge / iMessage layer is fine — do not re-debug it

Verified on Bart's Mac (where BlueBubbles + bridge live):

- **BlueBubbles has the messages.** Inbound `Hi` arrived at ROWID 908, guid `048ADC17-CC6A-419E-8A21-F589F9228477`, text field populated correctly. YouTube URL at ROWID 907, guid `7296F639-E42D-40F3-893C-66E4D8895501`.
- **Bridge daemon is running** (`scripts/f2-imessage-bridge.mjs`, PID 79846, started Fri). Logs at `~/Library/Logs/f2-bridge/bridge.out.log`. Log shows it forwarded the YouTube URL to Vercel with response `{"ok":true}`. (`Hi` not in bridge log — most likely BB's native webhook beat it, bridge got `skipped: duplicate` and doesn't log dups.)
- **Vercel webhook received both messages.** Both guids are in `f2_processed_webhooks` (15:28:32 UTC for the URL, 15:42:13 UTC for `Hi`). The webhook handler claims the guid *before* `after()` runs, so the dedup row proves only that the request was accepted — not that processing finished.

## Where the bug is (Vercel side)

`src/app/api/f2/clients/imessage/webhook/route.ts` acks `{ok:true}` immediately and defers work to `after(async () => { ... processMessage ... sendIMessage ... })`. That deferred block is failing silently for *every* inbound message.

For the URL path specifically, I confirmed no `f2_threads` row gets created — so the failure is at or before `createThread` inside `handleNewUrl` (`src/lib/f2/agent.ts:52`). Direct insert into `f2_threads` with the same `{user_id, url, content, ...}` works, so the DB and schema are fine.

For the chitchat path (`Hi`), I did not verify what happens — but since both URL and non-URL fail, the regression is probably common to both: either inside `processMessage`, or in `sendIMessage` (BlueBubbles outbound), or in env-var setup on the latest Vercel deploy.

## Suspected window

Last known good: `[2026-05-23T15:43:55Z] forward BAB0DAE3 ... C B C → {"ok":true}` (worked, got reply).

Deploys between then and now (commits on `main`, all 2026-05-23 PT):

- `e7c02da` F2: web app + user accounts + quiz tracking — added `f2_users` FK on `f2_threads.user_id`
- `9275bca` F2: dedup webhook invocations by message guid
- `4a25480` F2: tool-using router for topic switch + chitchat + topic-only threads
- `e7c02da` introduced `F2_DEFAULT_IMESSAGE_USER_ID` env var requirement in the webhook
- `490217d` F2: realtime voice (Phase 1) — added `f2_voice_sessions`, separate code path

## Reproduce

```bash
source .env.local
GUID="TEST-$(date +%s)-x"
curl -s -X POST "https://hilma-nine.vercel.app/api/f2/clients/imessage/webhook?secret=$BLUEBUBBLES_WEBHOOK_SECRET" \
  -H 'content-type: application/json' \
  -d "{\"type\":\"new-message\",\"data\":{\"guid\":\"$GUID\",\"text\":\"https://example.com/\",\"isFromMe\":false,\"handle\":{\"address\":\"test@test.com\",\"service\":\"iMessage\"},\"chats\":[{\"guid\":\"iMessage;-;test@test.com\"}]}}"
# → {"ok":true}, then no f2_threads row for handle=test@test.com appears.
```

## Next step

Read the Vercel function logs for `/api/f2/clients/imessage/webhook` since 2026-05-23 ~17:00 PT. The `try { ... } catch (e) { console.error('[f2/imessage] processing failed for ${guid}', e) }` in the webhook will have the actual error.
