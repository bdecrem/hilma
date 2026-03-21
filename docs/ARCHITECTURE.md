# Hilma Architecture Strategy

## What broke in vibeceo8

The core mistake: one Next.js app serving 12 domains through an 861-line middleware file, bundling 40+ embedded apps and 349MB of synth engines/samples into every deploy. Result: 8GB heap builds, 465MB uploads, and any change to any domain rebuilds everything.

What *worked*: separate Railway services for web/sms-bot/discord-bot, rapid domain spinup (just add middleware lines), shared synth engines. The chaos was productive in MVP phase.

## The Hilma Strategy

**Turborepo monorepo with pnpm workspaces.** One repo, many small apps, shared packages, independent deploys.

```
hilma/
├── apps/
│   ├── home/           → hilma.xyz (landing, projects page)
│   ├── jambot-web/     → jambot.whatever
│   ├── pixelpit/       → pixelpit.gg
│   ├── [next-idea]/    → its-own-domain.com
│   ├── discord-bot/    → Railway/Fly (long-running)
│   └── _template/      → copy this to start new app
├── packages/
│   ├── ui/             → shared components
│   ├── utils/          → shared helpers
│   ├── db/             → shared Supabase/DB client
│   └── tsconfig/       → shared TypeScript config
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Key rules

1. **Each app = its own Vercel project.** Own domain, own env vars, own deploy history. A bug in app A never takes down app B.

2. **turbo-ignore on every Vercel project.** Push a change to `apps/home` → only `home` rebuilds. Push to `packages/ui` → only apps that import it rebuild. Everything else skipped.

3. **Shared code in packages/, not copy-paste.** UI components, DB client, auth logic — write once, import everywhere via `"@hilma/ui": "workspace:*"`.

4. **New project in under a minute:** `cp -r apps/_template apps/new-thing` → update package.json name → `pnpm install` → import to Vercel → live.

5. **Long-running services (bots) deploy elsewhere** but live in the same repo for shared code access. Discord bot → Railway. SMS → Railway. Web apps → Vercel.

6. **No mega-middleware.** Each app handles its own routing. One domain per app. Period.

## What this prevents

- No 8GB builds (each app builds independently, small)
- No 465MB uploads (no bundling 40 apps into one deploy)
- No middleware spaghetti (each app has ~10 lines of middleware, max)
- No cascading failures (deploy app A, app B untouched)

Deploy times stay fast because Turborepo caches builds and turbo-ignore skips unchanged apps. The current 5-second build / 34-second deploy stays that way even with 15 apps.

## Migration path

Don't migrate vibeceo8. It stays as-is for anything that's live. When you want to bring something over to hilma:

1. Create a new app in `apps/`
2. Rewrite clean (it's usually faster than untangling)
3. Point the domain to the new Vercel project
4. Old vibeceo8 route becomes dead code

## Tech stack per app

- **Framework:** Next.js 15+, React 19, App Router
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS v4
- **Build:** Turborepo + Turbopack (dev)
- **Packages:** pnpm workspaces
- **Deploy (web):** Vercel (per-app projects)
- **Deploy (services):** Railway or Fly.io (long-running processes)
