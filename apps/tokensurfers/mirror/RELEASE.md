# Snapshot releases to bdecrem/tokensurfers

Token Surfers is developed in hilma and released as a snapshot into its own
public, MIT-licensed repo, https://github.com/bdecrem/tokensurfers
(checked out at `../tokensurfers` next to hilma). Do this whenever a
release-worthy state lands, not on every commit.

1. Commit and push hilma first. The snapshot is built from hilma's committed
   HEAD — uncommitted work is never included (the script says so if there is any).
2. From hilma:

   ```bash
   SCAN_VALUES="$(grep -E '^(SURF_APP_KEY|SUPABASE_SERVICE_KEY|SURF_SESSION_SECRET)=' .env.local | cut -d= -f2- | tr '\n' ' ')" \
     apps/tokensurfers/mirror/sync.sh ../tokensurfers --push https://github.com/bdecrem/tokensurfers.git
   ```

   This re-clones the repo into `../tokensurfers`, replaces everything except
   its history with `ios/`, `web/`, `schema/`, `art/`, README, LICENSE and
   .gitignore, then runs two checks and refuses to push on either:
   - **secret scan** — Secrets.swift, key-shaped strings (Anthropic, OpenAI,
     JWT, private keys, SendGrid, GitHub), and the exact values in `SCAN_VALUES`;
   - **import scan** — the web code may only import `@/lib/surf/*`,
     `@/app/surf/*` and packages, because that is all the mirror ships.
   Then it commits "Sync from hilma@<sha>" and pushes.
3. Check that the mirror's web side still builds on its own:

   ```bash
   cd ../tokensurfers/web && pnpm install && pnpm build
   ```

Without `--push` (`sync.sh <some-dir>`) it only assembles and scans, for a look
before releasing. What the mirror is made of, and the README it ships with,
live in this folder (`mirror/`): edit README.md / LICENSE / gitignore / web/
here, never in `../tokensurfers`, which is overwritten on the next snapshot.
