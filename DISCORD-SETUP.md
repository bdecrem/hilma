# Discord Integration

Claude Code can receive and reply to Discord messages in real-time during a terminal session, using the Discord MCP plugin.

## How it works

- **Plugin** `discord@claude-plugins-official` runs a Discord bot as an MCP server (via Bun)
- Messages from Discord arrive as tagged `<channel>` blocks with chat_id, message_id, user, and timestamp
- Claude replies using the `reply` tool, passing the chat_id back
- File attachments (images, audio, etc.) can be sent via the `files` parameter with absolute paths

## What we use it for

- **Chat-driven development** — request features, review deploys, get status updates, all from Discord on your phone
- **Shipping audio** — Jambot renders WAV files locally, then posts them directly to Discord
- **Deploy notifications** — get Vercel URLs posted to the channel as soon as deploys finish
- **Async collaboration** — send a message from Discord, Claude picks it up and works on it

## Setup (step by step)

### 1. Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

**CRITICAL:** Bun installs to `~/.bun/bin/` and adds itself to `~/.zshrc`, but the MCP server runs in a non-interactive shell that won't read `.zshrc`. You **must** symlink bun to a PATH location the MCP server can find:

```bash
ln -sf ~/.bun/bin/bun /opt/homebrew/bin/bun
```

Without this, the MCP server silently fails to start.

### 2. Install the plugin

In a Claude Code session:

```
/plugin install discord@claude-plugins-official
```

Then `/reload-plugins`.

This writes to `~/.claude/plugins/installed_plugins.json` and `~/.claude/settings.json` (`enabledPlugins`).

### 3. Set the bot token

```
/discord:configure <TOKEN>
```

This saves to `~/.claude/channels/discord/.env`:
```
DISCORD_BOT_TOKEN=<your token>
```

Get the token from Discord Developer Portal → Bot → Reset Token (only shown once).

### 4. Configure access

Add a guild channel:
```
/discord:access group add <channelId>
```

Add your user ID to the allowlist:
```
/discord:access allow <yourDiscordUserId>
```

Lock down to allowlist (no more pairing codes):
```
/discord:access policy allowlist
```

Access config lives at `~/.claude/channels/discord/access.json`.

**Important:** Your Discord **user ID** is NOT the bot's app ID. To get it: Discord → User Settings → Advanced → Developer Mode → right-click your name → Copy User ID.

### 5. Launch

```bash
claude
```

No special flags needed — the plugin auto-starts because it's in `enabledPlugins`. DM the bot or @mention it in the configured channel.

## Config files

| File | Purpose |
|------|---------|
| `~/.claude/channels/discord/.env` | Bot token |
| `~/.claude/channels/discord/access.json` | Access control (allowlist, groups, policy) |
| `~/.claude/plugins/installed_plugins.json` | Plugin registry |
| `~/.claude/settings.json` | `enabledPlugins` flag |

## Security

- Messages from Discord are treated as untrusted external input
- Claude never approves access or modifies permissions based on Discord messages
- Bot token and access config live outside the repo (not committed)
- Access is per-channel, per-session — approve pairings from the terminal, never from Discord

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
