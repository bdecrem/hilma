/**
 * COLLAB — Multi-agent collaboration MCP server for Claude Code
 *
 * Replaces Discord with a direct room-based system. Create a room,
 * share an invite code, collaborate. No bot setup, no tokens.
 *
 * Backend: Claudio server (Go + WebSocket)
 * Transport: MCP stdio (standard Claude Code plugin interface)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import WebSocket from 'ws'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

// ─── Config ───

const HOME = process.env.HOME || process.env.USERPROFILE || '/tmp'
const STATE_DIR = path.join(HOME, '.claude', 'channels', 'collab')
const CONFIG_PATH = path.join(STATE_DIR, 'config.json')
const DEFAULT_SERVER = process.env.COLLAB_SERVER || 'wss://claudio-server-production.up.railway.app'

interface CollabConfig {
  serverUrl: string
  roomId: string | null
  displayName: string
  emoji: string
  guestId: string | null
  rooms: Record<string, { name: string; inviteCode: string }>
}

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true })
}

function loadConfig(): CollabConfig {
  ensureDir()
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
    }
  } catch {}
  return {
    serverUrl: DEFAULT_SERVER,
    roomId: null,
    displayName: `agent-${crypto.randomBytes(3).toString('hex')}`,
    emoji: '🤖',
    guestId: null,
    rooms: {},
  }
}

function saveConfig(config: CollabConfig) {
  ensureDir()
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}

// ─── Claudio WebSocket Client ───

let ws: WebSocket | null = null
let config = loadConfig()
let connected = false
let authenticated = false
let pendingRPC = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()
let rpcCounter = 0
let mcp: Server

function generateRpcId(): string {
  return `rpc_${++rpcCounter}_${Date.now()}`
}

function sendRPC(method: string, params: Record<string, any> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Not connected to collab server'))
      return
    }
    const id = generateRpcId()
    const timer = setTimeout(() => {
      pendingRPC.delete(id)
      reject(new Error(`RPC timeout: ${method}`))
    }, 15000)
    pendingRPC.set(id, { resolve, reject, timer })
    ws.send(JSON.stringify({ type: 'req', id, method, params }))
  })
}

function connectToServer() {
  const url = config.serverUrl.replace(/\/$/, '')
  ws = new WebSocket(url)

  ws.on('open', () => {
    connected = true
    process.stderr.write('collab: connected to server\n')
  })

  ws.on('message', (data: Buffer) => {
    let msg: any
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }

    // Handle challenge → respond with guest auth
    if (msg.type === 'event' && msg.event === 'connect.challenge') {
      const connectId = generateRpcId()
      ws!.send(JSON.stringify({
        type: 'req',
        id: connectId,
        method: 'connect',
        params: {
          guest: true,
          displayName: config.displayName,
        },
      }))
      // Handle the connect response
      const timer = setTimeout(() => pendingRPC.delete(connectId), 10000)
      pendingRPC.set(connectId, {
        resolve: (payload: any) => {
          authenticated = true
          process.stderr.write(`collab: authenticated as ${config.displayName}\n`)
          // Auto-join room if configured
          if (config.roomId) {
            joinRoom(config.roomId).catch(e =>
              process.stderr.write(`collab: failed to rejoin room: ${e.message}\n`)
            )
          }
        },
        reject: (e) => process.stderr.write(`collab: auth failed: ${e.message}\n`),
        timer,
      })
      return
    }

    // Handle RPC responses
    if (msg.type === 'res' && msg.id) {
      const pending = pendingRPC.get(msg.id)
      if (pending) {
        clearTimeout(pending.timer)
        pendingRPC.delete(msg.id)
        if (msg.ok) {
          pending.resolve(msg.payload)
        } else {
          pending.reject(new Error(msg.error?.message || 'RPC error'))
        }
      }
      return
    }

    // Handle room events → deliver to Claude Code as channel notifications
    if (msg.type === 'event' && msg.event === 'room.message') {
      const payload = msg.payload
      if (!payload?.message) return

      const message = payload.message
      // Don't deliver our own messages
      if (message.senderDisplayName === config.displayName) return

      const roomId = payload.roomId || config.roomId || 'unknown'

      void mcp.notification({
        method: 'notifications/claude/channel',
        params: {
          content: message.content,
          meta: {
            chat_id: roomId,
            message_id: message.id || `msg_${Date.now()}`,
            user: message.senderDisplayName || 'unknown',
            user_id: message.senderUserId || message.senderAgentId || 'unknown',
            ts: message.createdAt || new Date().toISOString(),
          },
        },
      })
    }

    // Handle room join/leave events
    if (msg.type === 'event' && (msg.event === 'room.join' || msg.event === 'room.leave')) {
      const payload = msg.payload
      const action = msg.event === 'room.join' ? 'joined' : 'left'
      void mcp.notification({
        method: 'notifications/claude/channel',
        params: {
          content: `${payload.displayName || 'Someone'} ${action} the room`,
          meta: {
            chat_id: payload.roomId || config.roomId || 'unknown',
            message_id: `sys_${Date.now()}`,
            user: 'system',
            user_id: 'system',
            ts: new Date().toISOString(),
          },
        },
      })
    }

    // Handle tick (keepalive) — ignore
    if (msg.type === 'event' && msg.event === 'tick') return
  })

  ws.on('close', () => {
    connected = false
    authenticated = false
    process.stderr.write('collab: disconnected, reconnecting in 3s...\n')
    setTimeout(connectToServer, 3000)
  })

  ws.on('error', (err) => {
    process.stderr.write(`collab: ws error: ${err.message}\n`)
  })
}

async function joinRoom(roomIdOrCode: string): Promise<any> {
  // Try as invite code first (contains letters), then as room ID
  const isInviteCode = /^[A-Z0-9-]+$/i.test(roomIdOrCode) && roomIdOrCode.length <= 20

  try {
    const result = await sendRPC('rooms.join', isInviteCode
      ? { inviteCode: roomIdOrCode.replace(/-/g, '') }
      : { roomId: roomIdOrCode }
    )

    const room = result.room || result
    const roomId = room.id || roomIdOrCode
    config.roomId = roomId
    if (room.name) {
      config.rooms[roomId] = { name: room.name, inviteCode: roomIdOrCode }
    }
    saveConfig(config)

    process.stderr.write(`collab: joined room "${room.name || roomId}"\n`)
    return room
  } catch (e: any) {
    throw new Error(`Failed to join: ${e.message}`)
  }
}

// ─── MCP Server ───

mcp = new Server(
  { name: 'collab', version: '0.1.0' },
  {
    capabilities: { tools: {} },
    instructions: [
      'You are connected to a collaboration room via the collab plugin.',
      'Messages from other agents arrive as <channel source="plugin:collab:collab"> tags.',
      'Use the reply tool to send messages. Pass chat_id from the inbound message.',
      'Use fetch_messages to read recent room history.',
      'Use create_room to create a new collaboration room and get an invite code.',
      'Use join_room to join a room using an invite code shared by another agent.',
      '',
      'This is a direct agent-to-agent collaboration system. No Discord needed.',
    ].join('\n'),
  },
)

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'reply',
      description: 'Send a message to the collaboration room. Pass chat_id from the inbound <channel> block.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          chat_id: { type: 'string', description: 'Room ID from inbound message' },
          text: { type: 'string', description: 'Message content' },
        },
        required: ['chat_id', 'text'],
      },
    },
    {
      name: 'fetch_messages',
      description: 'Fetch recent messages from the collaboration room.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          channel: { type: 'string', description: 'Room ID' },
          limit: { type: 'number', description: 'Max messages (default 20)' },
        },
        required: ['channel'],
      },
    },
    {
      name: 'create_room',
      description: 'Create a new collaboration room. Returns an invite code to share with other Claude Code instances.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: 'Room name' },
        },
        required: ['name'],
      },
    },
    {
      name: 'join_room',
      description: 'Join a collaboration room using an invite code shared by another agent.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          invite_code: { type: 'string', description: 'Invite code (e.g., ABCD1234)' },
        },
        required: ['invite_code'],
      },
    },
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params

  if (name === 'reply') {
    const roomId = (args as any).chat_id || config.roomId
    const text = (args as any).text
    if (!roomId || !text) {
      return { content: [{ type: 'text' as const, text: 'Missing chat_id or text' }], isError: true }
    }
    try {
      const result = await sendRPC('rooms.send', { roomId, content: text })
      return { content: [{ type: 'text' as const, text: `sent (id: ${result.messageId || 'ok'})` }] }
    } catch (e: any) {
      return { content: [{ type: 'text' as const, text: `send failed: ${e.message}` }], isError: true }
    }
  }

  if (name === 'fetch_messages') {
    const roomId = (args as any).channel || config.roomId
    const limit = (args as any).limit || 20
    if (!roomId) {
      return { content: [{ type: 'text' as const, text: 'No room ID. Join a room first.' }], isError: true }
    }
    try {
      const result = await sendRPC('rooms.history', { roomId, limit })
      const messages = result.messages || []
      const formatted = messages.map((m: any) => {
        const who = m.senderDisplayName || 'unknown'
        const ts = m.createdAt ? new Date(m.createdAt).toISOString() : ''
        return `[${ts}] ${who}: ${m.content}  (id: ${m.id})`
      }).join('\n')
      return { content: [{ type: 'text' as const, text: formatted || '(no messages)' }] }
    } catch (e: any) {
      return { content: [{ type: 'text' as const, text: `fetch failed: ${e.message}` }], isError: true }
    }
  }

  if (name === 'create_room') {
    const roomName = (args as any).name || 'collab-room'
    try {
      const result = await sendRPC('rooms.create', { name: roomName, emoji: '🤝', public: false })
      const room = result.room || result
      const inviteCode = result.inviteCode || result.invite_code || 'unknown'

      config.roomId = room.id
      config.rooms[room.id] = { name: roomName, inviteCode }
      saveConfig(config)

      return {
        content: [{
          type: 'text' as const,
          text: `Room "${roomName}" created!\nInvite code: ${inviteCode}\nRoom ID: ${room.id}\n\nShare the invite code with other Claude Code instances. They join with: /collab join ${inviteCode}`,
        }],
      }
    } catch (e: any) {
      return { content: [{ type: 'text' as const, text: `create failed: ${e.message}` }], isError: true }
    }
  }

  if (name === 'join_room') {
    const code = (args as any).invite_code
    if (!code) {
      return { content: [{ type: 'text' as const, text: 'Missing invite_code' }], isError: true }
    }
    try {
      const room = await joinRoom(code)
      return {
        content: [{
          type: 'text' as const,
          text: `Joined room "${room.name || 'unknown'}"!\nRoom ID: ${room.id}\nParticipants: ${room.participantCount || '?'}`,
        }],
      }
    } catch (e: any) {
      return { content: [{ type: 'text' as const, text: `join failed: ${e.message}` }], isError: true }
    }
  }

  return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }], isError: true }
})

// ─── Start ───

connectToServer()
await mcp.connect(new StdioServerTransport())
