# ola-skillcue

- 1.0.0 (2026-11-22, OLA-284): the OLA-230 checker (M4 iMac, WebKit, try 4, Nov 20) asked a cloud project to
  publish; Ola's model never called the skill tool, tried Read "publish.md" and Glob "/opt/ola/skills/publish/**"
  (no path, so opencode searched the project folder: 0 files, measured with opencode 2.3.2), then ran
  `which ola-publish` and `ola-publish --help` and published without prepare. Now a request to publish gets the
  publish skill's text in the system prompt, in the skill tool's shape. Tests: skillcue.test.mjs 6 of 6,
  opencode.check.mjs 4 of 4 (real opencode, stand-in model).
- 2.0.0 (2026-11-23, OLA-421): the request tests on release 5a3a4555734f found three standing rules followed about
  half the time from the long instructions alone: with Ola on the Mac, "have claude code do this one: write a file
  called hello.txt that says hi" wrote hello.txt itself (0 of 2), "every monday morning, check the city council
  agenda" got no schedule sentence (0 of 2; in a cloud project on Nov 23 it once promised to look "each Monday
  morning"), and the birdsong page's reply opened with "The page is done and the sound check passed" (0 of 2). Now
  the rule that applies (`RULES`: claude, schedule, real-sound) is put in the system prompt of that request, on
  every step, worded for the case it fits. The Claude rule stays out when the cloud's web server already put its
  fact about Claude in front of the request. "Can you give me a link to this page that I can send to my group"
  now loads the publish skill (it loaded nothing, and Ola answered from an old publish record with a dead
  address). Copies kept equal by the test: the Claude pattern (frontdesk/claude.mjs) and the schedule sentence
  (evals/asks/abilities.json). Tests: skillcue.test.mjs 10 of 10, opencode.check.mjs 7 of 7.
- 2.1.0 (2026-11-23, OLA-421 check #1): on app.ola.cx (release 9310a7a0789d), after the garden club page was taken down
  with the Unpublish button, "whats the link for the garden club page? i want to text it to everyone" matched no pattern:
  no skill, no rule, and Ola searched the project for "sites\.ola\.cx" and gave the 404 address as "published here" and
  "already live" (twice). Now a request for the link, URL or address of a page, or whether it is up, in many wordings
  (`LINK_ASK`, not a change to a link on the page), loads the publish skill and gets the `link` rule: Ola cannot look at
  an address, nothing it reads is a look, a link is a publish with the card. And whatever the request said, a read, search
  or shell output that names a sites.ola.cx address gets an `[Ola address note]` beside it (execute.after hook), once per
  conversation, not for ola-publish or the publish script themselves. Tests: skillcue.test.mjs 13 of 13, opencode.check.mjs
  9 of 9 (the note reached the model in the tool result through real opencode 2.3.2; its read tool takes `path`).
- 2.2.0 (2026-11-23, OLA-285 check #2): on app.ola.cx (release 9310a7a0789d) the checker set a cloud project's publish record
  to "publishing, checking" (what the web server hands while it checks the address) and asked "is my page live yet?" (twice)
  and "hey did that page actually go up or not": Ola read .ola/publish/result.json itself, answered in seconds ("Not quite yet",
  once "open it in your own browser") and never ran `ola-publish status`, which waits for the outcome (0 of 3). The link rule
  would have said to publish again. Now, while the record says publishing (and is not older than ola-publish's own 15 min +
  wait), such a question gets the `pending` rule instead of `link`: run `ola-publish status` as a command, answer from what it
  prints, never from the record, never publish again, never send the person to look. The address note says the same while a
  publish is pending. "did that page go up", "did it publish", "is it live yet" now count as link questions. Tests:
  skillcue.test.mjs 14 of 14, opencode.check.mjs 10 of 10 (the pending rule reached the model through real opencode 2.3.2).
- 2.3.0 (2026-11-27, OLA-497): designer, app-designer and sound load only when a person names them (BY_NAME): the
  server's system config now denies skill.use for them, so the model is not offered them (on the speed check of Nov 27,
  release d24a04dc5fa9, the model loaded the designer skill for a kite toy and a tip calculator and read its quick.md
  and base.css; plain OpenCode wrote one file), and a request that names one ("use the designer skill", "Ola's house
  style", "three design concepts", "the app-designer skill", "the sound skill") gets its text here. Tests:
  skillcue.test.mjs, one new.
