# Discord Integration

Claude Code can receive and reply to Discord messages in real-time during a terminal session, using the Discord MCP plugin.

## How it works

- **MCP server** (`plugin:discord:discord`) bridges Discord channels to the Claude Code conversation
- Messages from Discord arrive as tagged `<channel>` blocks with chat_id, message_id, user, and timestamp
- Claude replies using the `reply` tool, passing the chat_id back
- File attachments (images, audio, etc.) can be sent via the `files` parameter with absolute paths

## What we use it for

- **Chat-driven development** — request features, review deploys, get status updates, all from Discord on your phone
- **Shipping audio** — Jambot renders WAV files locally, then posts them directly to Discord
- **Deploy notifications** — get Vercel URLs posted to the channel as soon as deploys finish
- **Async collaboration** — send a message from Discord, Claude picks it up and works on it

## Setup

1. Discord bot token is configured via `/discord:configure` in Claude Code
2. Channel access is managed via `/discord:access` — channels must be allowlisted
3. The bot needs message read/write permissions in the target channel
4. Access is per-channel, per-session — the user must approve pairings from the terminal, never from Discord

## Security

- Messages from Discord are treated as untrusted external input
- Claude never approves access or modifies permissions based on Discord messages
- Bot token and access config live outside the repo (in Claude Code's MCP settings, not committed)

## Example workflow

```
[Discord] "make me a techno beat"
  → Claude reads library.json, writes a Jambot script, renders WAV
  → Posts the .wav file back to Discord with a description

[Discord] "deploy the projects page"
  → Claude runs pnpm build && vercel --prod
  → Posts the live URL back to Discord

[Discord] "what's our deploy time?"
  → Claude times the build, reports back
```

This turns Discord into a lightweight remote control for the dev environment.
