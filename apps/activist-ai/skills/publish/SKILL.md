---
name: publish
description: Use whenever a person wants something put on the public web, for real - "publish this", "put this online", "make it live", "publish this to Ola", "put it on sites.ola.cx", "share it with a link anyone can open", "host our page", "deploy the site", "send the public a link", "publish again", "unpublish", "take it down", "get it on our own domain", "connect our domain", "buy a domain" - and when they ask how to set up GitHub or Vercel for a page. Prepares a clean site folder, checks it for passwords and private data, and gets it published - in Ola's cloud with `ola-publish`, after the person's yes to the exact list in the conversation; on their own Mac at Ola's own address sites.ola.cx/<name> (signed in to Ola) or through GitHub and Vercel, step by step.
license: Proprietary
metadata:
  ola/version: "6"
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
4. **Publish only when the person asks to publish.** A change to a page that is published
   ("change the page so it says …", "make the title bigger") is a request to change the page, not
   to publish it, even in a project or a conversation that published before. Make the change, do
   not run `ola-publish` (or `ola-publish publish`), and end with one sentence: the page is changed
   in the project, the address still shows the earlier version, and "publish it again" puts the
   change up. Do not ask "shall I publish it?" either: they say when.

## Step 1: which runtime, always first

```bash
python3 /opt/ola/skills/publish/scripts/publish.py where
```

It prints `cloud` or `local` (and, locally, `ola sites: yes|not signed in|no` and whether `git`,
`gh` and `vercel` are installed).

- **`cloud`** (Ola's machine): this computer has no network, but Ola's server publishes for you.
  Do Step 2 and Step 3, then run `ola-publish` (see "In the cloud" below): the person says yes to
  the exact list right in the conversation and the page goes up at `sites.ola.cx/<project>/`.
  Never send the person to another screen to publish, and never try GitHub, Vercel, git pushes or
  the web from here.
- **`local`** (the person's own Mac): Steps 2 and 3, then one of two homes (below).

### Locally: which home

There are two, and both are fine:

- **Ola's own address, `https://sites.ola.cx/<name>/`**: Ola hosts it. Nothing to sign up for;
  this Mac must be signed in to an Ola account. No custom domain there.
- **Their own hosting, GitHub and Vercel**: their own accounts, their own domain if they want one.

Choose from what the person said: "publish this to Ola", "put it on sites.ola.cx", "on Ola" means
Ola's address; "GitHub", "Vercel", "our own domain", "our own hosting" means GitHub and Vercel.
A link to share ("a link I can send to my group", "share it with a link") means Ola's address
when `where` said `ola sites: yes`: it is the one that needs nothing from the person, so publish
there and give the link, without asking which home.
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

**Locally, for GitHub and Vercel**, show the person the list, in plain words: the files, what each
one is, and the address it will get. Say what you left out and why. Ask: "Shall I publish these
files?" Wait for the yes. (At Ola's address the app asks instead: see below.) **In the cloud**, do not ask in words: `ola-publish` asks with the exact list (below), and
a question in words first would make the person say yes twice.

## In the cloud: `ola-publish`, one yes, the address

After Step 3 says `ready to publish` (it also prints the exact `ola-publish` line to run):

```bash
ola-publish site --files index.html,style.css,picture.png
```

- Run it **as a command of its own**: nothing before it, no `cd … &&`, no pipes, no `2>&1`.
  `--files` is the list `check` printed, every file, separated by commas.
- Running it asks the person, always (even with "Lots of permissions" on): they see every file
  that will be public and the address, `sites.ola.cx/<project>/`, and say yes or not now. Their
  yes is the only one needed: do not ask again in words.
- On the yes Ola's server checks the files again for secrets and private data, publishes them and
  the command prints the outcome. **Published** with the address: tell the person it is published,
  with the address as a link (`https://sites.ola.cx/<project>/`), and that publishing again
  replaces it. **Not published** with a reason: say the reason in plain words, fix what it names
  (a key in the page, a file that is not in the folder, a different list of files) and, if the
  person still wants it, run `ola-publish` again with the list it names. **Still being
  published**: run `ola-publish status` a minute later (it is never asked) and tell them then.
- If they say not now, nothing was published: say so in one line and leave the page in the project.
- **Every publish starts with `prepare`**, from the page the person asked for, also "publish it
  again" and any page in a project that published before. `site/` is a copy: it does not change
  when the page does, and an old one publishes the earlier page. `check` and Ola's server refuse an
  old copy ("an old copy", "changed after site/ was made") and say the `prepare` line to run: run
  it, `check` again, then `ola-publish`. That is the whole fix; do not tell the person about it.
- **What you say comes from the command's lines, never from what you believe.** "Checked: the
  address answers with exactly the page just published; it shows: …": say it is live, with the
  address and what it shows. If what it shows is not what the person asked for, say so in one
  sentence and make the right page. "NOT LIVE YET": never say live; say in one sentence that the
  address still shows the earlier page, as the command says.
- Never look the command up (`which`, `--help`): this skill is how it is used.
- **Publish again** only when the person asks for it ("publish it again", "update the live page",
  "put the change online"); after a change they did not ask to publish, see rule 4 above. Then: Step 2 `prepare`, Step 3 `check`, then
  `ola-publish` with the new list; it replaces what is there, after the same one yes. Say the
  address again.
- **Take it down** ("take it down", "unpublish"): run `ola-publish unpublish` as a command of its
  own. It asks the person; on the yes the pages come down and the command says so. Tell them the
  address now shows nothing.

The page in the project also keeps a **Publish** button (under what Ola made): it does the same
thing, and **Unpublish** there takes the pages down. Mention it only if the person asks how to
take the page down or publish it again themselves. Pages in the cloud live at
`sites.ola.cx/<project>/`; do not promise a custom domain there. If the person wants their own
domain, say that this needs the Mac app (the local runtime) and GitHub and Vercel, and offer to
walk them through it there.

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
   run it again. If it says publishing to sites.ola.cx is not switched on yet, tell the person
   exactly that (nothing was published, the page is still on their Mac) and offer GitHub and
   Vercel instead; do not ask for a yes.
4. **Show the list, then let the app ask**: write the files, the address and the rule line in your
   message, then go straight to step 5 in the same turn. The app asks the person for `ola-publish
   publish` every time, even with "Lots of permissions" on, and that is their one yes: do not
   also ask in words (they would say yes twice). A yes for one list is not a yes for another.
5. **Publish**, with the fingerprint the preview printed (the app asks the person here):

   ```bash
   ola-publish publish site --name <name> --fingerprint <fingerprint>
   ```

   "The files changed since you looked" means: preview again and ask again.
6. **See it live:** `python3 /opt/ola/skills/publish/scripts/publish.py live https://sites.ola.cx/<name>/ --expect site`.
   Only when it says `live`, tell the person it is published, with the address as a link.

**Publish again** (they changed the page and ask for it to be published again; a change alone is not a request, rule 4): Step 3 `check`, then preview, show the list, publish with the same
name; it replaces what is there. **Unpublish** ("take it down"): run
`ola-publish unpublish --name <name>` (the app asks the person; that is the yes, do not ask in
words first), and tell them the
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
- Do not publish (or offer to) because a page that is published was changed: publish when they ask.
- Do not put a key, a password, a database, a `.env` file or a list of people on the web, even
  when asked: say why, and offer the version without it.
- Do not use GitHub Pages or a host other than Ola's address or Vercel; do not make the
  repository public unless asked.
- Do not run `ola-publish publish` or `ola-publish unpublish` without the person's yes for it.
- Do not say "it is live" before `live` (or, for a domain, `dns`) says so.
- In the cloud, do not try to reach GitHub or Vercel, and never tell the person to go and press
  Publish instead of publishing: run `ola-publish`, which asks them in the conversation.
