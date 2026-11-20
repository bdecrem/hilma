# Vercel: sign up with GitHub, import the repository, deploy on every push

Before anything, say it plainly: **Vercel's free plan (Hobby) is for personal, non-commercial
sites. A site for an organization (a group, a campaign, a nonprofit, a business) may need the
paid plan, Pro.** Vercel's terms and its pricing page (<https://vercel.com/pricing>) decide; do not
quote a price from memory.

## Without the Vercel CLI: click by click

Give one step at a time and wait for "done":

1. Open <https://vercel.com/signup>. Choose **Hobby** (or **Pro** for an organization), type a
   name, then **Continue with GitHub**, and on GitHub's page **Authorize Vercel**.
2. On Vercel's dashboard: **Add New…**, then **Project**.
3. Under "Import Git Repository", find the repository (`<name>`). If it is not listed: **Adjust
   GitHub App Permissions**, choose the account, **Only select repositories**, add `<name>`,
   **Save**, and come back.
4. Click **Import** beside it.
5. Framework Preset: **Other**. Root Directory: leave it as it is (`./`). Build and Output
   Settings: leave them empty. Nothing under Environment Variables: a static site needs none, and
   a key put there does not belong in a page anyway.
6. Click **Deploy**. After about a minute Vercel shows "Congratulations" and the address,
   `https://<name>.vercel.app` (or with a suffix if the name was taken). Ask the person to tell you
   the address, or read it from the project's page.

From then on every push to the repository's `main` branch deploys by itself; a push to another
branch makes a preview at its own address.

## With the Vercel CLI

- Not installed: `npm i -g vercel` (needs Node; on a Mac with Homebrew, `brew install node` first).
- `vercel login`: it opens the browser; the person chooses **Continue with GitHub**. Wait for the
  terminal to say it is logged in. Never ask for a token.
- Then `publish.py vercel site --name <name> --repo <github-user>/<name>`: `vercel link` (makes
  the project), `vercel git connect` (every push deploys), `vercel deploy --prod` (the first
  deploy, which prints the address).

## When a deploy fails

The project's **Deployments** tab shows each deploy and its log. For a folder of plain files the
usual cause is a Framework Preset other than "Other" or a Build Command set: Settings, Build and
Deployment, set the preset to Other and clear the commands, then **Redeploy**.

## Taking it down

Settings (of the project), at the bottom, **Delete Project**: the address stops at once. Or keep
the project and remove the files from the repository and push.
