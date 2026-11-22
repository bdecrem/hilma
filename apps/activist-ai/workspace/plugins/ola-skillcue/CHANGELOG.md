# ola-skillcue

- 1.0.0 (2026-11-22, OLA-284): the OLA-230 checker (M4 iMac, WebKit, try 4, Nov 20) asked a cloud project to
  publish; Ola's model never called the skill tool, tried Read "publish.md" and Glob "/opt/ola/skills/publish/**"
  (no path, so opencode searched the project folder: 0 files, measured with opencode 2.3.2), then ran
  `which ola-publish` and `ola-publish --help` and published without prepare. Now a request to publish gets the
  publish skill's text in the system prompt, in the skill tool's shape. Tests: skillcue.test.mjs 6 of 6,
  opencode.check.mjs 4 of 4 (real opencode, stand-in model).
