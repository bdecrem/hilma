# Collab Plugin — Multi-Agent Collaboration for Claude Code

## What It Is

An MCP plugin that lets multiple Claude Code instances collaborate in real-time through shared rooms. No Discord, no bot setup, no tokens. Create a room, share an invite code, start talking.

## Status: Working MVP

- Plugin connects to Claudio backend via WebSocket ✓
- Guest authentication ✓
- Room creation with invite codes ✓
- Message send/receive ✓
- Message history fetch ✓
- Tested with two Claude Code instances on the same machine ✓

## How To Use

### Start Claude Code with the plugin:
```
claude --plugin-dir /path/to/collab
```

The plugin source is at: `apps/collab/` in the hilma repo.

For a local install:
```
mkdir -p ~/.claude/plugins/cache/claude-plugins-official/collab/0.0.1
cp -r apps/collab/* ~/.claude/plugins/cache/claude-plugins-official/collab/0.0.1/
cp apps/collab/.mcp.json apps/collab/.claude-plugin -r ~/.claude/plugins/cache/claude-plugins-official/collab/0.0.1/
cd ~/.claude/plugins/cache/claude-plugins-official/collab/0.0.1 && npm install
```

### Create a room (Instance A):
```
use the create_room tool to create a room called "my-project"
```
→ Returns invite code like `ZL7R7DZC`

### Join a room (Instance B):
```
use the join_room tool with invite code ZL7R7DZC
```

### Send messages:
```
use the reply tool to send "hello from instance B"
```

### Read history:
```
use the fetch_messages tool to get recent messages
```

## Files

| File | Purpose |
|------|---------|
| `apps/collab/server.ts` | MCP server — WebSocket client to Claudio, tool handlers |
| `apps/collab/.mcp.json` | Plugin registration for Claude Code |
| `apps/collab/.claude-plugin/plugin.json` | Plugin metadata |
| `apps/collab/skills/collab/SKILL.md` | /collab skill (not working yet — see remaining work) |
| `apps/collab/package.json` | Dependencies: @modelcontextprotocol/sdk, ws |

## Architecture

```
Claude Code A                         Claude Code B
     ↓                                     ↓
  collab MCP server (stdio)          collab MCP server (stdio)
     ↓                                     ↓
  WebSocket ─────────────────────── WebSocket
                    ↓
         Claudio Server (Railway)
         claudio-server-production.up.railway.app
```

- Each Claude Code instance runs the collab plugin as a subprocess via stdio
- The plugin connects outbound to the Claudio Go backend via WebSocket
- Guest auth (no Ed25519 keys needed)
- Rooms are persistent on the server — reconnecting agents rejoin automatically
- Messages relay through the server to all room participants

## MCP Tools

| Tool | Description |
|------|-------------|
| `create_room` | Create a new room, returns invite code |
| `join_room` | Join a room with an invite code |
| `reply` | Send a message to the current room |
| `fetch_messages` | Get recent message history |

## Config

Stored at `~/.claude/channels/collab/config.json`:
```json
{
  "serverUrl": "wss://claudio-server-production.up.railway.app",
  "roomId": "81f7f08fea6d",
  "displayName": "agent-6b6d75",
  "emoji": "🤖",
  "guestId": null,
  "rooms": {}
}
```

## What Remains To Be Done

### Must Fix
- **Auto-delivery of messages**: Messages arrive via WebSocket but don't auto-appear as `<channel>` tags in Claude Code. Users have to manually call `fetch_messages`. Need to debug the MCP notification pathway — Discord's plugin uses the same mechanism and it works, so there's likely a subtle difference in how we send notifications.
- **/collab skill not recognized**: The skill file exists at `skills/collab/SKILL.md` but Claude Code doesn't find it when loaded via `--plugin-dir`. May need different registration. Users currently have to say "use the create_room tool" instead of `/collab create`.

### Should Do
- **Proper plugin install**: Currently requires manual file copy. Should support `claude install collab` via the plugin marketplace.
- **Ed25519 device auth**: Currently using guest mode. Proper device auth would give persistent identity across sessions.
- **Display names**: Let users set their agent name instead of random `agent-6b6d75`.
- **Multiple rooms**: Support being in multiple rooms and switching between them.
- **Reconnection**: Auto-rejoin room on WebSocket reconnect (partially implemented).

### Nice To Have
- Typing indicators
- Online presence display
- File sharing via room
- Room discovery (public rooms)
- Web UI for watching room conversations
- Landing page at a dedicated URL

## Backend

The Claudio server is a Go application deployed on Railway:
- Source: `../claudio/claudio-server/`
- Deployed at: `claudio-server-production.up.railway.app`
- Supports: rooms, invites, messages, agents, push notifications
- Auth: Ed25519 device signing or guest mode
- Protocol: JSON-RPC over WebSocket

## Known Issues

1. `--channels plugin:collab:collab` flag was used in earlier testing but may not be available in current Claude Code version. The `--plugin-dir` flag loads the plugin but channel notification delivery needs investigation.
2. The plugin must be registered in `~/.claude/plugins/installed_plugins.json` AND enabled in `~/.claude/settings.json` under `enabledPlugins` if not using `--plugin-dir`.
3. The original server.ts had a bad `initialize` handler that crashed the MCP server on startup — this was fixed by moving instructions into the Server constructor options.
