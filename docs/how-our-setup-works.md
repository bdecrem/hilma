# How our setup works, and a simpler one to copy

Written for someone new to software development who already uses Claude. Share it with your Claude and talk it through.

## In plain English

Bart builds a lot of small software projects: websites, iPhone apps, games, and tools for learning. Nearly all of it lives in one shared folder that keeps a complete history of every change, so nothing gets lost and any mistake can be undone. Bart mostly works by describing what he wants to Claude, which writes the code, tests it, and saves the result. Saving to the main copy of that folder is what publishes the work: a few minutes later, the updated website is live for anyone to visit. A handful of outside services do the jobs a project can't do alone, such as storing users' information, sending texts and emails, and running the website itself.

What makes this work isn't one clever tool. It's that everything has a known place, and Claude is given a written guide to the project that says how things are done here, what to avoid, and what went wrong before. Each mistake becomes a new line in that guide, so the same mistake doesn't happen twice. Bart's version has grown large over time, but you don't need most of it. Part II describes a much smaller setup with the same basic shape, and it is enough to build a serious app with real users and real data.

---

## Part I: Bart's setup

"We" here means Bart and Claude. The numbers are a snapshot from November 2026.

### The core idea

One repository, called **hilma**, holds about 40 standalone apps and dozens of web projects, with more than 1,800 commits so far. It's a single Next.js app that serves many sites, plus an `apps/` folder for everything that isn't a web page. The flow for nearly all work is:

```
Bart describes it → Claude Code builds and tests it → commit → push to GitHub → Vercel deploys it → live in 1–2 minutes
```

### The main stack

| Layer | What we use | Why |
|---|---|---|
| Code and history | Git + GitHub | Every change is recorded and can be undone. A push is also the deploy trigger. |
| Web framework | Next.js 15 (App Router), React 19, TypeScript in strict mode, Tailwind v4 | One language across pages and server code. |
| Hosting | Vercel | Rebuilds and deploys automatically on every push to `main`. |
| Database and file storage | Supabase (Postgres) | A real relational database, with a table prefix for each app (`onething_users`, `osai_messages`). |
| AI | Claude API, with OpenAI and ElevenLabs for voice | Powers the features inside the apps. |
| Packages | pnpm | Fast, with a lockfile so installs are repeatable. |
| The builder | Claude Code | Writes the code, and also runs builds, drives a browser, and checks the database. |

### How the repo is organized

```
src/app/      web pages and API routes, one folder per project
src/lib/      shared server logic, one folder per project
src/fonts/    web fonts stored in the repo, never downloaded at build time
apps/         anything with its own runtime (iPhone apps, bots, Mac services)
public/       static files
scripts/      one-off tools and test scripts
docs/         plans and write-ups
misc/         experiments
```

Nothing goes at the root of the repo.

### The part that matters most: CLAUDE.md

`CLAUDE.md` is a file Claude reads at the start of every session. Ours says what each app is, where things go, how to deploy, and which mistakes not to repeat. There are about 25 of these, because a big app keeps its own notes in its own folder and Claude picks them up when it works there. Most rules include the incident behind them, like "Google Fonts took every deploy down, so fonts are stored in the repo." Knowing the reason helps Claude apply a rule sensibly in new situations.

Some of the rules that have earned their place:

- **"It compiles" doesn't mean "it works."** Claude has to use the feature the way a person would, in a real browser or the iPhone simulator, before calling it done.
- **Spec first.** For anything a user touches, write down the behavior in a few bullets before writing code. This catches the most expensive kind of bug: building the wrong thing correctly.
- **Run the build before every push.** One broken build stops every site in the repo from deploying.
- **Fail loudly.** Don't add silent fallbacks that hide a real problem.
- **Secrets stay out of the code.** They live in `.env.local`, which git ignores, and in Vercel's settings.
- **Finish the job.** Verified, committed, and pushed, not left half done.

### Where it gets sophisticated

None of this is needed to start. It's listed so you can see what each piece is for.

| Piece | What it does |
|---|---|
| Custom domains | One Vercel project answers on many domains, and host rewrites in `next.config.ts` send each domain to its own app. |
| Scheduled jobs | Vercel cron hits hourly endpoints, for example to send a daily text at each user's local time. |
| Mac mini | An always-on Mac handles what the cloud can't: sending iMessages (through BlueBubbles), fetching YouTube transcripts, and running research agents. |
| Tunn3l | Our own tunnel service, on a DigitalOcean server, gives machines at home a public URL. |
| Railway | Hosts a long-running WebSocket server for live voice, which Vercel's short-lived functions can't do. |
| iPhone apps | SwiftUI apps built with Xcode and shipped through TestFlight, using the same backend as the websites. |
| Discord bot | Mention it in Discord and Claude Code on the mini builds and ships the request. |
| Email | SendGrid. |
| Specialized hardware and models | Code that targets a real 1986 Macintosh Plus and a drum synth, plus small AI models trained for learning. |

---

## Part II: A simpler setup for you

This has everything needed for a sophisticated app with accounts, saved data, AI features, and automatic deploys.

### The five pieces

| Piece | Job | Cost to start |
|---|---|---|
| **GitHub** | Stores your code and its history | Free |
| **Vercel** | Runs your site, deploying on every push | Free for hobby projects |
| **Supabase** | Database, user login, file storage | Free tier |
| **Claude Code** | Builds with you inside your project | Your Claude plan |
| **A domain** (optional) | `yourname.com` instead of a Vercel address | About $10–20 a year |

Free tiers have limits that change, so ask your Claude to check the current ones. Two to know about: Vercel's free plan restricts how often scheduled jobs can run, and Supabase may pause free projects that sit idle.

**One repository per project** is the best starting point. Bart's single big repo pays off at dozens of apps, and until then it mostly adds complexity.

### Setup, in order

1. Install Node.js, pnpm, Git, the GitHub CLI (`gh`), and Claude Code. Sign in to GitHub with `gh auth login`.
2. Create the app:
   ```bash
   pnpm create next-app@latest my-app --typescript --tailwind --app --src-dir
   cd my-app
   ```
3. Put it on GitHub. Use a private repo while you're learning:
   ```bash
   gh repo create my-app --private --source=. --push
   ```
4. Go to vercel.com, choose **Add New Project**, and import the repo. From then on, each push to `main` deploys.
5. Create a Supabase project. Copy its URL and keys into `.env.local`, and add the same values to Vercel under **Settings → Environment Variables**.
6. Add a `CLAUDE.md` using the starter below.
7. Build one tiny feature that goes all the way through, like a page that saves a note and shows it after a refresh, with a login. Do this before anything ambitious. If it works once in production, every later feature uses the same path.

### Folder layout

```
my-app/
  CLAUDE.md             how this project works, for Claude
  README.md             how this project works, for people
  .env.local            secrets (git ignores this; never commit it)
  .env.example          the variable names, with no values
  src/
    app/                pages
    app/api/            server endpoints
    components/         shared UI pieces
    lib/                database and business logic
  supabase/migrations/  numbered changes to the database
  scripts/              one-off tools
  docs/                 plans and notes
```

### How data should work

- **Change the database through migration files.** Each change gets a file in the repo, so the database has a history just as the code does. Ask Claude to use the Supabase CLI for this. Avoid changing tables by hand in the dashboard, because those changes aren't recorded anywhere.
- **Use Supabase Auth for login.** Don't build your own password system.
- **Turn on Row Level Security for every table.** RLS is a rule inside the database saying "people can only see their own rows." It protects you even if the app code has a bug. Bart's apps do this differently, with their own login sessions and server-only database access, but Supabase Auth with RLS is the safer default when you're starting out.
- **Know your two kinds of keys.** The publishable (anon) key is safe in the browser, because RLS limits what it can do. The service or secret key bypasses RLS completely, so it must only ever be used on the server.
- **Keep AI keys on the server.** The browser calls your API route, and the route calls Claude. An API key sent to the browser can be copied by anyone. In Next.js, anything named `NEXT_PUBLIC_*` goes to the browser, so a secret must never have that prefix.

### Your daily loop

1. Tell Claude what you want, and have it write the steps a user will experience before it writes code.
2. Let it build, then have it run the app and try the real flow.
3. Read the diff. Ask about anything you don't understand. This is how you actually learn.
4. Run `pnpm build`, commit, and push.
5. Open the live site and check it.
6. If something went wrong, add a line to `CLAUDE.md` saying what happened and what to do instead.

Commit often, in small steps. A commit is a save point, and small ones are easy to undo.

When real people depend on your app, start making changes on a branch. Vercel gives every branch its own preview URL, so you can test there before merging to `main`. A second Supabase project for development also keeps experiments away from real data.

### A starter CLAUDE.md

Copy this in and fill in the blanks. Keep it short, and let it grow from real mistakes.

```markdown
# [App name]

[One sentence: what this app does and who it's for.]

## Stack
Next.js (App Router), TypeScript in strict mode, Tailwind, Supabase, Vercel, pnpm.

## Commands
- `pnpm dev` starts the local server
- `pnpm build` runs a production build
- `pnpm lint` checks the code

## Where things go
- Pages: `src/app/`. Server endpoints: `src/app/api/`.
- Database and business logic: `src/lib/`. Shared UI: `src/components/`.
- One-off scripts: `scripts/`. Plans: `docs/`.
- Nothing new at the repo root.

## Rules
- I'm learning. Explain important decisions in plain language, and tell me
  when I'm asking for something risky.
- Before building anything a user touches, list the steps they'll experience
  and check them with me.
- Done means tested. Run the feature for real, not only the build.
- Run `pnpm build` before every push. Deploys go out from `main`.
- Secrets go in `.env.local` and Vercel, never in code. Never commit them.
- Secret keys are server-only. Never give one a `NEXT_PUBLIC_` name.
- Every database change is a migration file in `supabase/migrations/`.
- Every table has Row Level Security on, with policies.
- Don't create database or API clients at the top of a file. Create them
  inside a function, or the build can crash when env vars aren't available.
- Don't add silent fallbacks. If something is missing, fail with a clear error.
- Ask before anything destructive: deleting data, dropping tables, force-pushing.

## Lessons learned
- [Date]: [what went wrong, and what to do instead]
```

### Add things when you feel the need

Don't set these up in advance. Add one when a real problem calls for it.

| When you need… | Add |
|---|---|
| Your own web address | A domain, connected in Vercel |
| To send email | Resend or SendGrid |
| To send text messages | Twilio |
| To take payments | Stripe |
| Something to run on a schedule | Vercel Cron, or Supabase Cron if you need it often on a free plan |
| To stop breaking things that used to work | Automated tests, and Playwright to drive a real browser |
| To know when production breaks | Sentry, or Vercel's logs to begin with |
| A server that stays running (live chat, WebSockets) | Railway |
| A public link to something on your laptop | A tunnel such as Cloudflare Tunnel |
| An iPhone app | SwiftUI, on the same backend. Your website's API routes can serve it. |

### Questions to ask your Claude

- "Read this document, then look at my project. What's different, and what should I change first?"
- "Walk me through what happens between `git push` and my site updating."
- "Explain Row Level Security using my tables, then try to find a way one user could read another user's data."
- "Is anything in my browser code a secret that should be on the server?"
- "What's the smallest version of my idea that would prove it works? Help me spec it."
