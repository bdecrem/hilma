# agent-imessage — the iMessage bridge for the Macintosh Plus

The mini half of **Macinclaude iMessage**. The Plus shows a conversation list +
thread and composes replies; this process is what actually touches the Mac's
Messages: it **reads** `~/Library/Messages/chat.db` and **sends** through
Messages.app via AppleScript.

It's a plain `node:net` TCP server (no socat/pty). The Plus reaches it through
the persistent-WiFi **multiplexer** (`../agent-mux`): the Plus opens a logical
channel to service `imessage`, and the mux relays that channel here. Run it
standalone for testing too.

```
Plus (imessage/) ──MUX channel "imessage"──> agent-mux :2330 ──> agent-imessage :2328 ──AppleScript + chat.db──> Messages.app
```

## Run

```bash
npm install
npm start            # TCP server on :2328 (what the mux dials)
npm run stdin        # interactive: type LIST / OPEN 0 / SEND 0 hi
npm run selftest     # reads real chat.db + checks frames; send path is dry-run
```

`agent-mux` already lists `imessage -> 127.0.0.1:2328` in its SERVICES map, so
once both are up the Plus's channel just works.

## Protocol (one line + `\r`)

Plus → agent: `LIST` · `OPEN <idx>` · `SEND <idx> <text>`
agent → Plus: `IMSTS`/`IMERR`/`IMSENT`, and `IMLIST`…`IMEND` (rows `C <idx> <unread> <name>`)
and `IMCONV <idx> <name>`…`IMEND` (messages `M <dir> <text>`, dir `>`=me `<`=them,
plus `+ <text>` continuations). Full spec in `src/protocol.ts`; the Plus parser
is `../imessage/im_rx.inc`. Output is ASCII-folded and line-capped (the modem's
telnet layer mangles high bytes) and paced to wire speed.

The agent polls chat.db every 3s; new incoming mail refreshes the list and,
if it lands in the thread the Plus has open, re-pushes that thread.

## Requirements / caveats

- **Full Disk Access.** Reading `chat.db` needs FDA for the running process
  (same permission the iMessage MCP plugin uses). In a terminal it inherits the
  terminal's FDA; as a LaunchDaemon, FDA must be granted to the binary.
- **Sending is real.** `SEND` actually texts the contact via Messages.app. Set
  `IMSG_DRY_RUN=1` to log instead of send (used by selftest and bring-up).
- `IMSG_CHATDB` overrides the chat.db path; `SURF_BAUD` sets the output pacing.
- Group chats with no display name currently show their chat-id (a hex string);
  1:1 and named group chats show the handle/name. Resolving participant names
  is a future nicety.

## Not yet a daemon

Like Surf before it, this runs hand-started for now (dies on reboot). A
`install-daemon.sh` + `sh.macplus.imessage.plist` (LaunchDaemon on :2328, FDA
granted) is the next deploy step — `../agent-surf/install-daemon.sh` is the
template.
