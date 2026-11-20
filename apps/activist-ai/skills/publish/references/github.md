# GitHub: git, the `gh` tool, an account, a sign-in

Do the commands yourself. The person only clicks in their browser. Never ask them to paste a
password, a code or a token into the conversation.

## git

`python3 /opt/ola/skills/publish/scripts/publish.py where` says `git: yes` or `no`.

- No git: run `xcode-select --install`. macOS shows a window: the person clicks **Install**, then
  **Agree**, and waits a few minutes. Then `git --version` should answer.
- The first commit may ask who is committing. Set it for this repository only, with the name and
  email the person gives you (their GitHub one keeps their email private:
  `<id>+<user>@users.noreply.github.com`, shown on github.com under Settings, Emails):
  `git config user.name "…"` and `git config user.email "…"` inside `site/`.

## `gh`, GitHub's command line tool

- `gh: no`: with Homebrew, `brew install gh`. Without Homebrew, the installer from
  <https://cli.github.com> (the person downloads the macOS package and opens it), or install
  Homebrew first from <https://brew.sh> if they want it.

## An account (only if they have none)

Tell the person, one step at a time, waiting for "done":

1. Open <https://github.com/signup>.
2. Type an email address, a password and a username. The username is part of the repository's
   address (`github.com/<username>/…`): a short, plain one, like the group's name.
3. Solve the puzzle GitHub shows, then type the code GitHub emails them.
4. Choose the free plan. Nothing else is needed.

An organization can make a GitHub organization later (github.com, the + menu, New organization);
for a first site, a personal account is enough.

## Signing in `gh`

```bash
gh auth status
```

- "You are not logged into any GitHub hosts": run `gh auth login --web --git-protocol https --hostname github.com`.
  It prints a one-time code and opens the browser. Tell the person: "Your browser opened a GitHub
  page. Type the code shown here, then click Authorize." (The code is on screen for them; it is
  not a secret worth hiding, but never repeat it into a file.) Wait, then run `gh auth status` again.
- Signed in: go on. `gh auth status` names the account: that is the `<github-user>` for Step 6.

## The repository

`publish.py repo` makes it private by default with `gh repo create … --private --source . --push`.
If the name is taken in their account, pick another short name and run it again. The person sees
it at `https://github.com/<github-user>/<name>`.
