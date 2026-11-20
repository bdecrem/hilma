# publish

One line per change: the version, the date, what failed (the failure label, if a run showed it), what changed, which evals moved.

- 1, 2026-11-19: first version (OLA-209). `scripts/publish.py`: `where` (cloud or local), `prepare` (a clean site folder from a page: the files it uses copied in, links made relative, no secret copied), `check` (every file that would go public, and secrets, databases, lists of people, links that leave the folder), `repo` (git and a private GitHub repository), `vercel` (link, connect the repository, first deploy, with the CLI), `live` and `dns`. In the cloud the agent prepares and checks, and the person presses Publish; locally GitHub and Vercel step by step, with the Hobby plan's personal, non-commercial limit said plainly. References: github.md, vercel.md, domains.md (Vercel, Namecheap, Cloudflare). Evals w1 and w2.
