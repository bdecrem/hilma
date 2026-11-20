---
name: publish
description: Use whenever a person wants something put on the public web, for real - "publish this", "put this online", "make it live", "publish this to Ola", "put it on sites.ola.cx", "share it with a link anyone can open", "host our page", "deploy the site", "send the public a link", "publish again", "unpublish", "take it down", "get it on our own domain", "connect our domain", "buy a domain" - and when they ask how to set up GitHub or Vercel for a page. Prepares a clean site folder, checks it for passwords and private data, and gets it published - in Ola's cloud by the person pressing Publish; on their own Mac at Ola's own address sites.ola.cx/<name> (signed in to Ola) or through GitHub and Vercel, step by step.
license: Proprietary
metadata:
  ola/version: "2"
  ola/specialists: "none"
  ola/evals: "w1-publish-ready w2-publish-secret"
  ola/owner: "ola"
  ola/needs: "none"
  ola/mac: "yes"
---

# Publish a page, for real

Publishing makes something public: anyone with the address can read it, search engines may find it,
and copies can outlive a takedown. So three things hold in every case:

1. **Only what the person chose goes public.** Show them the exact list of files first.
2. **Nothing secret, nothing private.** A key in a page is readable by every visitor. A list of
   people (names with emails or phone numbers), a database, a `.env` file, an uploaded document
   the group did not say is public: none of these go, whatever the person asks. Say what you left
   out and why, in one sentence each.
3. **A yes before anything leaves.** Ask, and wait for the answer, every time, even when you are
   allowed to work without asking. A yes for one list is not a yes for a changed list.

## Step 1: which runtime, always first

```bash
python3 /opt/ola/skills/publish/scripts/publish.py where
```

It prints `cloud` or `local` (and, locally, `ola sites: yes|not signed in|no` and whether `git`,
`gh` and `vercel` are installed).

- **`cloud`** (Ola's machine): this computer has no network and you cannot publish from it. Do
  Step 2 and Step 3 only, then tell the person to press **Publish** on the page in the project
  (see "In the cloud" below). Never try GitHub, Vercel, git pushes or the web from here.
- **`local`** (the person's own Mac): Steps 2 and 3, then one of two homes (below).

### Locally: which home

There are two, and both are fine:

- **Ola's own address, `https://sites.ola.cx/<name>/`**: Ola hosts it. Nothing to sign up for;
  this Mac must be signed in to an Ola account. No custom domain there.
- **Their own hosting, GitHub and Vercel**: their own accounts, their own domain if they want one.

Choose from what the person said: "publish this to Ola", "put it on sites.ola.cx", "on Ola" means
Ola's address; "GitHub", "Vercel", "our own domain", "our own hosting" means GitHub and Vercel.
Ask only when the request does not say (a plain "publish this"), once, in about these words:
"Where should it live: at Ola's own address, sites.ola.cx/<name> (nothing to sign up for), or on
your own hosting with GitHub and Vercel (accounts needed; your own domain possible)?" A site
published at Ola's address before (`ola-publish status` lists the person's names) is published
again there unless they say otherwise.

## Step 2: a clean site folder

A published site is one folder with an `index.html`, every file it uses inside that folder, every
link relative. Make it from the page the person means:

```bash
cd /work && python3 /opt/ola/skills/publish/scripts/publish.py prepare <the page>.html --out site
```

`prepare` copies the page to `site/index.html` with the pictures, styles and scripts it uses,
moves files from outside the page's folder in under `site/assets/`, turns links that start with
`/` into relative ones, and never copies a secret: it stops and names the file and line. Then:

- **It stopped on a secret** (an API key in a script, a password): take the key out of the page.
  A page in a browser cannot keep anything secret; a form that needs a key needs a server, which a
  published page does not have. Make the page work without it (a `mailto:` link, a link to the
  group's existing form, or the part left out), and say so to the person.
- **It notes a load from another site** (a font, a script or a picture from a CDN): on Ola's sites
  address a page may load only its own files, so in the cloud download the file into `site/`
  (with `ola-fetch`, if the person allows the web) and link it there, or drop it and use what is
  in the folder (Ola's bundled fonts, `/opt/ola/skills/designer`). Locally it would work, but
  copying it in is still better: the page then does not depend on another site.
- **It names a file that is not there**: fix the link or drop it.

Never move or delete the person's own files to make a site: `site/` is a copy.

## Step 3: check exactly what goes public, and ask

```bash
python3 /opt/ola/skills/publish/scripts/publish.py check site
```

It lists every file that would go public with its size, and the problems: secrets and keys,
databases, lists of people (a table with emails or phone numbers), `.env` files, links that leave
the folder or start with `/`, files that are missing. Fix every PROBLEM line and run it again until
it says `ready to publish`. Hidden files are left out by itself.

Then show the person the list, in plain words: the files, what each one is, and the address it
will get. Say what you left out and why. Ask: "Shall I publish these files?" Wait for the yes.

## In the cloud: the person presses Publish

Stop after Step 3 and tell the person, in about these words:

> The page is ready in `site/`. To put it online, open the project, find "<the page's title>" under
> Pages, and press **Publish**. Ola shows you every file that will be public and the address,
> `sites.ola.cx/<project>/`, and publishes only when you say yes. Publish again updates it;
> Unpublish takes it down.

The front desk checks the files again for secrets before anything leaves; it refuses a key, a
`.env` file and the project's database with a plain sentence. Do not promise a custom domain in
the cloud: pages there live at `sites.ola.cx/<project>/`. If the person wants their own domain,
say that this needs the Mac app (the local runtime) and GitHub and Vercel, and offer to walk them
through it there.

## Locally, at Ola's address: sites.ola.cx/<name>/

After Steps 2 and 3, with the folder ready (`site/`):

1. **Signed in?** `where` said `ola sites: yes`. If it said `not signed in` (or `ola-publish`
   says so), tell the person plainly: "This Mac isn't signed in to Ola, so I can't publish to
   Ola's address from here. Sign in in the Ola app (Settings, Account, Sign In), or in Terminal
   with `ola login`, then ask me again. Or I can publish it with GitHub and Vercel instead." Stop
   there until they choose. `no` means this Ola has no way to Ola's address: use GitHub and Vercel.
2. **A name**: the folder under sites.ola.cx, 3 to 32 lowercase letters, digits and dashes, from
   the page's subject (`tenants-meeting`, not `site` or `page1`). Use one the person named, or one
   of theirs from `ola-publish status` when they publish again.
3. **The list, from Ola:**

   ```bash
   ola-publish preview site --name <name>
   ```

   It sends the folder to Ola's server to be checked (nothing goes public, nothing is kept) and
   prints the files that would be public, the address, what was left out and why, notes, the
   rule line and a fingerprint. If it refuses (a key, a `.env`, a database, a name that belongs to
   someone else), say its sentence to the person, fix what it names (or choose another name), and
   run it again.
4. **Ask, every time**, even with "Lots of permissions" on: show the files, the address and the
   rule line, and ask "Shall I publish these N files at https://sites.ola.cx/<name>/?" Wait for
   the yes. A yes for one list is not a yes for another.
5. **Publish**, with the fingerprint the preview printed (the app asks the person once more):

   ```bash
   ola-publish publish site --name <name> --fingerprint <fingerprint>
   ```

   "The files changed since you looked" means: preview again and ask again.
6. **See it live:** `python3 /opt/ola/skills/publish/scripts/publish.py live https://sites.ola.cx/<name>/ --expect site`.
   Only when it says `live`, tell the person it is published, with the address as a link.

**Publish again** (they changed the page): Step 3 `check`, then preview, ask, publish with the same
name; it replaces what is there. **Unpublish** ("take it down"): ask first ("Shall I take
sites.ola.cx/<name>/ down now?"), then `ola-publish unpublish --name <name>`, and tell them the
address now shows nothing. The name stays theirs, so nobody else can use its old links.

Pages at Ola's address work like the cloud's: they load only their own files, keep nothing per
visitor (no storage, no cookies) and a form posts nowhere. For their own domain, use GitHub and
Vercel (below).

## Locally, on their own hosting: GitHub holds the work, Vercel serves it

For their own hosting Ola recommends one host: **Vercel**, deploying from **GitHub**. Not GitHub
Pages, not another host. The work lives in a GitHub repository; every push to it updates the site
by itself.

### Step 4: git and a GitHub sign-in

`where` said whether `git` and `gh` are there. Then `gh auth status`. What to do for each case is in
`/opt/ola/skills/publish/references/github.md` (installing git and `gh`, making a GitHub account
in the browser click by click, `gh auth login --web`). Do the commands yourself; the person only
clicks in the browser. Never ask for a password or a token in the conversation.

### Step 5: the repository, private by default

After the yes from Step 3:

```bash
python3 /opt/ola/skills/publish/scripts/publish.py repo site --name <short-name> --dry-run
python3 /opt/ola/skills/publish/scripts/publish.py repo site --name <short-name>
```

The dry run shows the commands; then run it for real. It checks the folder again, writes a
`.gitignore` that keeps secrets out, commits, and makes the repository **private** (the site is
public, the repository need not be) and pushes. `--public` only when the person asks for it.

### Step 6: Vercel, connected to the repository

Tell the person plainly, before they sign up: **Vercel's free plan (Hobby) is for personal,
non-commercial sites. An organization's site (a group, a campaign, a nonprofit's) may need the
paid plan, Pro**; Vercel's own terms decide, and Vercel's pricing page says the current price.

- **With the Vercel CLI** (`where` says `vercel: yes`; after `vercel login`, which opens the
  browser: choose "Continue with GitHub"):

  ```bash
  python3 /opt/ola/skills/publish/scripts/publish.py vercel site --name <short-name> --repo <github-user>/<short-name> --dry-run
  python3 /opt/ola/skills/publish/scripts/publish.py vercel site --name <short-name> --repo <github-user>/<short-name>
  ```

  It links a Vercel project, connects the repository (every push deploys) and makes the first
  deploy, which prints the address (`https://<short-name>.vercel.app`).
- **Without it**: the click-by-click steps in `/opt/ola/skills/publish/references/vercel.md`
  (sign up with GitHub, Add New, Project, Import the repository, Deploy). Give the person one step
  at a time and wait for "done" before the next.

### Step 7: see it live

```bash
python3 /opt/ola/skills/publish/scripts/publish.py live https://<short-name>.vercel.app/ --expect site
```

`live` waits up to two minutes for the address to answer with exactly the page in `site/`. Only
when it says `live` tell the person it is published, with the address as a link. To change the
site later: change `site/`, run `check`, ask, then `git add -A && git commit -m "…" && git push`
in `site/`, and `live` again.

### Step 8: a domain, when they want one

The two ways, and the exact records, are in `/opt/ola/skills/publish/references/domains.md`:
buy one in Vercel's dashboard (it sets everything up), or attach one bought at Namecheap or
Cloudflare. After the records are in:

```bash
python3 /opt/ola/skills/publish/scripts/publish.py dns <their-domain> --wait 600
```

It says `live` when the domain points at Vercel and answers over https, `not yet` with what it
found otherwise. A change at the registrar can take up to an hour; tell the person when it is live,
not before.

## What not to do

- Do not publish without the list and a yes; do not publish more than the list.
- Do not put a key, a password, a database, a `.env` file or a list of people on the web, even
  when asked: say why, and offer the version without it.
- Do not use GitHub Pages or a host other than Ola's address or Vercel; do not make the
  repository public unless asked.
- Do not run `ola-publish publish` or `ola-publish unpublish` without the person's yes for it.
- Do not say "it is live" before `live` (or, for a domain, `dns`) says so.
- In the cloud, do not try to reach GitHub, Vercel or `ola-publish`: the person presses Publish.
