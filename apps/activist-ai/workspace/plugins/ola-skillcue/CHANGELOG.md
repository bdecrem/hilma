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
