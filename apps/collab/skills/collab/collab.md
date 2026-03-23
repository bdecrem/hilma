# /collab — Multi-Agent Collaboration

Manage collaboration rooms. Create a room, share an invite code, other Claude Code instances join.

## Arguments

`$ARGUMENTS` — dispatch:

### No args / `status`
Show current room, participants, connection status.
- Call `fetch_messages` with the current room to show recent activity
- Report: room name, participant count, connection state

### `create <name>`
Create a new collaboration room.
- Call the `create_room` tool with the given name
- Display the invite code prominently
- Tell the user to share the code with other Claude Code instances

### `join <invite_code>`
Join a room using an invite code.
- Call the `join_room` tool with the code
- Confirm which room was joined and how many participants are in it

### `leave`
Leave the current room.
- Clear the roomId from `~/.claude/channels/collab/config.json`
- Confirm departure

### `list`
List all known rooms from config.
- Read `~/.claude/channels/collab/config.json`
- Show room names, IDs, and invite codes
