# The Seminar (bartin16.xyz/seminar)

**Where things are, since the afternoon of 2026-11-23** (the sections below were written as
the day went and still say "the page" for the website sheet):

| Address | What | Words in |
|---|---|---|
| `/seminar` | Landing page: the three projects, and "Before you come" (request the Stanford Claude account, install the app, the five sign-in steps Bart approved) | `home.json` (drawn by `page.tsx`) |
| `/seminar/claude` | How to get the free Claude account (fellows: Stanford's Claude for Education request; visiting scholars: a month of Pro at claude.ai that Bart reimburses) and the six sign-in steps, from his Nov 23 mail to the fellows; linked from the "Do this first" card at the very top of `/seminar` (`home.first`). Added 2026-11-24 in a cloud session that had no browser to look at it: check it at both widths | `claude/content.json` |
| `/seminar/website` | Project 1, the work website (was at `/seminar` until that afternoon) | `website/content.json` |
| `/seminar/library` | Project 2, the paper library, with the Consensus / Scite / Zotero section | `library/content.json` |
| `/seminar/fact-checker` | Project 3, John Markoff's fact-checking skill; the file itself is served at `/seminar/fact-checker/SKILL.md` (`public/seminar/fact-checker/`) | `fact-checker/content.json` |

`Sheet.tsx` draws the three project sheets, `SHEETS` in it is the row of links on top of each.
Bart's numbering is his: website 1, library 2, fact checker 3 (I had the last two the other
way round for an hour). On every sheet he wants the answer to "how do I use this tomorrow,
after I shut my laptop": for the library, double-click Open Trust Shelf; and everywhere,
**rename and pin the project** in the Claude app.

**The fact-checker sheet has not been run by anyone.** Bart gave the headline ("Working on
your book? Use this skill and Claude will be your fact checker", by CASBS alum John Markoff)
and the skill file (it arrived by iMessage; five passes, flags and never rewrites, saves
`<file>_factcheck.md` beside the document). The seven steps are my best plain route (put
SKILL.md in the manuscript folder, open the folder in the Code tab, tell Claude it is there).
Have him or a fellow run it on a real chapter and correct the steps from what happens.

The prose of the landing page and the fact-checker sheet is mine, not Opus's: the plan was at
96% of its week when they were written. If Bart finds it stiff, that is the first thing to
hand to Opus.

Bart's hands-on seminar for the CASBS fellows is **Wednesday, December 2, 2026**. The
exercise: each fellow builds and publishes their own work website with Claude Code (the
Code tab of the Claude desktop app), on the free Stanford Claude for Education account,
model Opus 5.5 Medium. This page is the sheet they follow. Started 2026-11-23.

## What exists

- **The page**: `page.tsx` draws, `content.json` holds every word, `Bits.tsx` is the two
  client parts (a step's number is a tick kept in `localStorage`; a "Say" bubble copies its
  line), `seminar.css` is the look (the homepage's: paper `#fff6ea`, Inter Tight light against
  semibold, clay `#d64a22`; the reset is wrapped in `:where()` so it never outweighs a class),
  `opengraph-image.tsx` the share image (Satori drops spaces between spans: the word space is
  a `columnGap`). `public/seminar/example.jpg` is a screenshot of the site Bart ended up with.
  `robots` is off: the page is shared by link.
- **Bart's own run** (2026-11-23, on his other computer, signed in to the Stanford account):
  the site he built is https://bart-at-casbs.vercel.app/ (office-hours sign-up at
  `/office-hours`, slots stored as one JSON file in Vercel Blob). It lives in a new GitHub and
  Vercel account he made during the run, not in this repo.
- **His dictated notes**, step by step as it happened: `~/Desktop/seminar/website-cheat-sheet.md`
  on the M4 iMac (24 raw steps). `content.json` was edited from them by Opus; when the two
  disagree about what happened, the notes are the record.

## How the text is written

Bart's rule, twice in one day: the lines people say to Claude are how a normal person talks
("Hey, make a nice office hours signup thing for me..."), never a specification with product
names. He asked for Opus to write the prose ("it writes more normal than you"): hand the
writing to an Opus agent with the facts and the voice, and keep his own quoted lines as he
said them. The page is in his voice, first person ("Mine suggested one called Upstash").
Never add a step, button or screen he did not meet.

## What he found, and what is still open

- **Too long for one sitting.** The whole run was 24 steps and felt like "2 hours in a
  classroom", not 30 minutes. The page therefore has Part 1 (build the page and see it on
  your own computer, no new accounts, about 30 minutes) and Part 2 (office hours, GitHub,
  Vercel, about another hour). He has not said whether the seminar itself does Part 1 only.
- **The accounts are the hard part, the building is easy.** Four GitHub/Vercel hoops in a row
  (log into Vercel again, link GitHub, Install, connect the repo), plus SIGN UP hidden under a
  big LOG IN on both sites, plus a device code step for GitHub that Claude first explained with
  a terminal.
- **Untested idea, offered twice, not answered:** signing up for Vercel with "Continue with
  GitHub" (instead of Google) should connect the two accounts from the start and remove most of
  the hoops. Nobody has run it. Do not put it on the page before a run on a fresh account
  proves it; the page says "Continue with Google" because that is what he told me to write.
- **Not yet tested by anyone but Bart:** the page's steps on Windows, and a student actually
  booking a slot on his site.
- **His site lists office hours on Thanksgiving (Nov 26) and the day after.**

## Before the seminar: everyone needs the Stanford Claude account

Each fellow requests it themselves from Stanford IT ("Request a Claude for Education Standard
License", from https://uit.stanford.edu/service/claude ; sign in with the SUNet ID). Bart's
own request went in on Thursday Nov 19 at 10:56 am and was filled at 2:56 pm the same day.
The university is closed Nov 26 and 27 for Thanksgiving. Signing in afterwards is by SUNet ID
(`sunetid@stanford.edu`, then "Continue with SSO"), never Google or "Continue with email";
visiting fellows have no Stanford mailbox and do not need one. The free Standard tier has no
Fable models. The sign-in commands that worked are in the memory note `stanford-claude-login`.

## The app's sign-in screens, as seen (2026-11-23, Claude for Mac 6.28899.6)

1. First window: "Claude for Mac", one button, **Get started**.
2. "Sign In": **Continue with Google**, OR, a box **Enter your email**, **Continue with email**.
3. Type an `@stanford.edu` address in the box and a third button appears under
   "Continue with email": **Continue with SSO**. That is the one; it goes to Stanford's page.

I wrote these steps twice from memory and Bart said both were wrong (there is no email box
on the first window). To see the signed-out screens without touching his own app:
`open -g -n -a /Applications/Claude.app --args --user-data-dir=<empty scratch folder>`,
look at it, then kill that one process. claude.ai/login in a headless browser shows a robot
check as soon as an address is typed, so it cannot be read that way.

## The second sheet: the paper library (bartin16.xyz/seminar/library), 2026-11-23

Bart's third seminar project (the second, a fact checker for a folder of your own work, has
no page yet; the prompt I gave him is in this session's history and untested). Each fellow
pulls a few hundred papers on one topic from arXiv and OpenAlex into a small database
(SQLite) in a folder on their laptop and searches it. Topic for the seminar: **trust**. He
judged it a better fit for 30 minutes than the website: no accounts.

- `Sheet.tsx` draws any sheet from its `content.json` (`SheetContent`); `/seminar` and
  `/seminar/library` are each a few lines. `SHEETS` is the row of links at the top of every
  sheet: add a sheet there. `og.tsx` is the shared share image. A sheet may have a `why`
  section (here: "Why build your own when Consensus, Scite and Zotero exist", which Bart asked
  for by name), and may leave out `stuck`, `next` and `example`.
- The facts in the `why` section were looked up on 2026-11-23 (Consensus: over 200 million
  papers, answers with citations; Scite: citations sorted supporting / contrasting /
  mentioning, over 1.6 billion statements; Zotero: free, Word and Google Docs, BibTeX/RIS).
  Prices were left out on purpose: the sources disagreed.
- His dictated notes: `~/Desktop/seminar/paper-library-cheat-sheet.md`. The run was still
  finished the same afternoon: 640 papers, and a chat page on the Mac opened by double-clicking
  a launcher ("Open Trust Shelf") that passes questions to the signed-in Claude Code, so no
  API key. He had to say no three times on the way (Python scripts, a Claude artifact, a
  helper app). His verdict: "it works, but the user has to double click on a little script."
  The "Make me a web page instead, still hosted locally." line on the page is my wording of
  what he reported asking; the other lines are his own.
- Open: whether the seminar should stop before the chatbot (asking questions in the Code tab
  itself needs no launcher); whether a plain Mac (not a developer's) can run what Claude
  builds; a Windows run (the launcher and the macOS warning are Mac things). arXiv and OpenAlex both
  answered without a key from this iMac, and the Mac's own `sqlite3` has full-text search.

## Checking a change

`npx next dev --turbopack -p 3288`, open `/seminar` at 1297 and 390 wide, look at the whole
page (cut the tall screenshot into pieces), click a tick and a Copy, fetch
`/seminar/opengraph-image`. Run the dev server and `tsc` under `nice -n 19` when Bart is working at this machine, and no
full `pnpm build` there while he is (Nov 23: it took the machine from him; OLA-430). Then commit, push, watch the deployment
(`npx vercel ls hilma`, `npx vercel inspect <url>`), and load
https://bartin16.xyz/seminar once it is out.
