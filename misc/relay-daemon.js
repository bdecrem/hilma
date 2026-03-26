#!/usr/bin/env node

/**
 * Relay Daemon — Agent-to-Agent Communication
 *
 * A lightweight background process that:
 * 1. Polls a Discord channel for RELAY protocol messages
 * 2. Writes inbound messages to ~/.claude/relay/inbox/
 * 3. Sends outbound messages from ~/.claude/relay/outbox/
 * 4. Optionally triggers Claude Code to process urgent messages
 *
 * Usage:
 *   node relay-daemon.js              # Run in foreground
 *   node relay-daemon.js &            # Run in background
 *   nohup node relay-daemon.js &      # Persist across terminal close
 *
 * Config: ~/.claude/relay/config.json
 * Token: ~/.claude/channels/discord/.env
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

const HOME = process.env.HOME || process.env.USERPROFILE;
const RELAY_DIR = path.join(HOME, '.claude', 'relay');
const INBOX_DIR = path.join(RELAY_DIR, 'inbox');
const OUTBOX_DIR = path.join(RELAY_DIR, 'outbox');
const CONFIG_PATH = path.join(RELAY_DIR, 'config.json');
const TOKEN_PATH = path.join(HOME, '.claude', 'channels', 'discord', '.env');
const POLL_INTERVAL = 5000; // 5 seconds

// ─── Setup ───
function ensureDirs() {
  for (const dir of [RELAY_DIR, INBOX_DIR, OUTBOX_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`No config at ${CONFIG_PATH}. Create it first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function loadToken() {
  if (!fs.existsSync(TOKEN_PATH)) {
    console.error(`No token at ${TOKEN_PATH}. Set up Discord MCP plugin first.`);
    process.exit(1);
  }
  const env = fs.readFileSync(TOKEN_PATH, 'utf-8');
  const match = env.match(/DISCORD_BOT_TOKEN=(.+)/);
  if (!match) {
    console.error('DISCORD_BOT_TOKEN not found in .env');
    process.exit(1);
  }
  return match[1].trim();
}

// ─── Discord REST API ───
async function discordFetch(endpoint, token, options = {}) {
  const url = `https://discord.com/api/v10${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bot ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchMessages(channelId, token, limit = 50, after = null) {
  let endpoint = `/channels/${channelId}/messages?limit=${limit}`;
  if (after) endpoint += `&after=${after}`;
  const messages = await discordFetch(endpoint, token);
  // Discord returns newest-first; reverse for oldest-first
  return messages.reverse();
}

async function sendMessage(channelId, token, content) {
  return discordFetch(`/channels/${channelId}/messages`, token, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

// ─── Protocol Parser ───
const RELAY_PATTERN = /^\[RELAY:(\w+)→(\w+)\]\[([a-f0-9]+)\]\[(\w+)\]\s*([\s\S]*)/;

function parseRelay(content) {
  const match = content.match(RELAY_PATTERN);
  if (!match) return null;
  return {
    sender: match[1],
    receiver: match[2],
    correlationId: match[3],
    type: match[4],
    body: match[5].trim(),
  };
}

// ─── Inbox/Outbox ───
function saveToInbox(message, parsed, config) {
  const filename = `${Date.now()}_${parsed.correlationId}_${parsed.type}.json`;
  const entry = {
    messageId: message.id,
    timestamp: message.timestamp,
    sender: parsed.sender,
    receiver: parsed.receiver,
    correlationId: parsed.correlationId,
    type: parsed.type,
    body: parsed.body,
    raw: message.content,
    processedAt: null,
  };
  fs.writeFileSync(path.join(INBOX_DIR, filename), JSON.stringify(entry, null, 2));
  console.log(`[INBOX] ${parsed.type} from ${parsed.sender}: ${parsed.body.substring(0, 80)}`);

  // Auto-respond to ASK and TASK messages
  if (parsed.type === 'ASK' || parsed.type === 'TASK') {
    autoRespond(filename, parsed, config);
  }
}

let responding = false;

function autoRespond(filename, parsed, config) {
  if (responding) {
    console.log(`[AUTO] Skipping — already processing a message`);
    return;
  }
  responding = true;

  const replyType = parsed.type === 'ASK' ? 'REPLY' : 'RESULT';
  const inboxPath = path.join(INBOX_DIR, filename);
  // Load project context for richer responses
  let context = '';
  try {
    const claudeMd = path.join(process.cwd(), 'CLAUDE.md');
    if (fs.existsSync(claudeMd)) context = fs.readFileSync(claudeMd, 'utf-8').substring(0, 2000);
  } catch {}

  const prompt = `You are ${config.agentId}, a Claude Code agent. You received a message from ${parsed.sender} (another Claude Code agent on a different machine). You are collaborating on projects together.

Project context:
${context}

Message type: ${parsed.type}
From: ${parsed.sender}
Message:
${parsed.body}

Respond helpfully. Use your tools to read files, run commands, check git status, etc. if needed to give an accurate answer. Write ONLY your response — no preamble.`;

  console.log(`[AUTO] Spawning claude to respond to ${parsed.type} from ${parsed.sender}...`);

  exec(`claude -p ${JSON.stringify(prompt)} --max-turns 3`, {
    timeout: 120000,
    maxBuffer: 1024 * 1024,
    cwd: process.cwd(),
  }, (err, stdout, stderr) => {
    responding = false;

    if (err) {
      console.error(`[AUTO] claude failed: ${err.message}`);
      return;
    }

    const reply = stdout.trim();
    if (!reply) {
      console.error(`[AUTO] claude returned empty response`);
      return;
    }

    // Write reply to outbox
    const outFile = `${Date.now()}_${parsed.correlationId}_${replyType}.json`;
    const outEntry = {
      receiver: parsed.sender,
      correlationId: parsed.correlationId,
      type: replyType,
      body: reply,
    };
    fs.writeFileSync(path.join(OUTBOX_DIR, outFile), JSON.stringify(outEntry, null, 2));
    console.log(`[AUTO] Reply queued: ${reply.substring(0, 80)}...`);

    // Mark inbox message as processed
    try {
      const entry = JSON.parse(fs.readFileSync(inboxPath, 'utf-8'));
      entry.processedAt = new Date().toISOString();
      fs.writeFileSync(inboxPath, JSON.stringify(entry, null, 2));
    } catch {}
  });
}

function checkOutbox(channelId, token, config) {
  const files = fs.readdirSync(OUTBOX_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const filepath = path.join(OUTBOX_DIR, file);
    try {
      const msg = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      const formatted = `[RELAY:${config.agentId}→${msg.receiver || config.peerId}][${msg.correlationId}][${msg.type}]\n${msg.body}`;
      sendMessage(channelId, token, formatted)
        .then(() => {
          console.log(`[OUTBOX] Sent ${msg.type} to ${msg.receiver || config.peerId}: ${msg.body.substring(0, 80)}`);
          fs.unlinkSync(filepath);
        })
        .catch(err => console.error(`[OUTBOX] Failed to send: ${err.message}`));
    } catch (err) {
      console.error(`[OUTBOX] Error processing ${file}: ${err.message}`);
    }
  }
}

// ─── Summary file for Claude Code to read ───
function updateSummary() {
  const files = fs.readdirSync(INBOX_DIR).filter(f => f.endsWith('.json'));
  const unprocessed = [];
  for (const file of files) {
    try {
      const entry = JSON.parse(fs.readFileSync(path.join(INBOX_DIR, file), 'utf-8'));
      if (!entry.processedAt) unprocessed.push(entry);
    } catch {}
  }
  const summary = {
    pendingCount: unprocessed.length,
    messages: unprocessed,
    lastChecked: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(RELAY_DIR, 'pending.json'), JSON.stringify(summary, null, 2));
}

// ─── Main Loop ───
async function main() {
  ensureDirs();
  const config = loadConfig();
  const token = loadToken();
  let lastMessageId = config.lastSeenMessageId || null;

  console.log(`[RELAY DAEMON] Started`);
  console.log(`  Agent: ${config.agentId}`);
  console.log(`  Peer: ${config.peerId}`);
  console.log(`  Channel: ${config.channelId}`);
  console.log(`  Polling every ${POLL_INTERVAL / 1000}s`);
  console.log('');

  const poll = async () => {
    try {
      const messages = await fetchMessages(config.channelId, token, 50, lastMessageId);

      for (const msg of messages) {
        // Update last seen
        lastMessageId = msg.id;

        // Skip our own messages
        if (msg.author.bot && msg.author.username !== config.peerId) {
          // Could be our own bot — check content
        }

        // Parse relay protocol
        const parsed = parseRelay(msg.content);
        if (!parsed) continue;

        // Only process messages addressed to us
        if (parsed.receiver !== config.agentId) continue;

        // Only accept from our configured peer
        if (parsed.sender !== config.peerId) {
          console.log(`[SKIP] Message from unknown sender: ${parsed.sender}`);
          continue;
        }

        // Save to inbox
        saveToInbox(msg, parsed, config);
      }

      // Save last seen message ID
      config.lastSeenMessageId = lastMessageId;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

      // Check outbox for pending sends
      checkOutbox(config.channelId, token, config);

      // Update summary
      updateSummary();

    } catch (err) {
      console.error(`[POLL ERROR] ${err.message}`);
    }
  };

  // Initial poll
  await poll();

  // Recurring poll
  setInterval(poll, POLL_INTERVAL);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[RELAY DAEMON] Shutting down');
    config.lastSeenMessageId = lastMessageId;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    process.exit(0);
  });
}

main();
