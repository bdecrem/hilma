#!/usr/bin/env node
// Reads conversations.json and classifies each as "explainer" or not using Haiku.
// An explainer = you asked Claude to teach you a concept and Claude gave a substantive explanation.

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

// load .env.local manually
const envPath = path.join(__dirname, '..', '..', '.env.local');
try {
  const env = await fs.readFile(envPath, 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const convs = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'conversations.json'), 'utf8'));

// Cache: reuse prior classifications by UUID so weekly re-runs only cost new convos.
let cached = [];
try {
  cached = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'classifications.json'), 'utf8'));
} catch {}
const cacheByUuid = new Map(cached.filter(c => c && c.uuid).map(c => [c.uuid, c]));
const toClassify = convs.filter(c => !cacheByUuid.has(c.uuid));

console.log(`→ ${convs.length} total conversations; ${cacheByUuid.size} cached, ${toClassify.length} new`);

function flatten(conv) {
  // Chat messages can live under chat_messages or tree-walked. Handle both.
  const msgs = Array.isArray(conv.chat_messages) ? conv.chat_messages : [];
  return msgs.map(m => {
    const text = (m.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
    return { role: m.sender, text };
  });
}

function preview(conv, maxChars = 3000) {
  const msgs = flatten(conv);
  if (msgs.length === 0) return '';
  // Title + first human + first assistant message is usually enough signal.
  const firstHuman = msgs.find(m => m.role === 'human')?.text?.slice(0, 1200) || '';
  const firstAssistant = msgs.find(m => m.role === 'assistant')?.text?.slice(0, 1500) || '';
  return `TITLE: ${conv.name || '(untitled)'}\n\nFIRST HUMAN MSG:\n${firstHuman}\n\nFIRST ASSISTANT MSG:\n${firstAssistant}`.slice(0, maxChars);
}

async function classify(conv) {
  const text = preview(conv);
  if (!text.trim()) return { isExplainer: false, topic: null, reason: 'empty' };
  const r = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: [{
      type: 'text',
      text: `You classify Claude conversations. An "explainer" is one where the user asked Claude to explain, teach, or define a concept (e.g. "what are hormones", "explain gradient descent", "how does X work"), AND Claude responded with a substantive conceptual explanation. NOT explainers: coding tasks, writing help, debugging, casual chat, edits, "fix this", "write X". Borderline cases (how-to guides, tutorials for using a tool) are NOT explainers unless they explain a concept. Respond ONLY with JSON: {"is_explainer": true|false, "topic": "short phrase" or null, "reason": "one short sentence"}`,
      cache_control: { type: 'ephemeral' },
    }],
    messages: [{ role: 'user', content: text }],
  });
  const raw = r.content[0]?.text ?? '{}';
  const json = raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
  try {
    const parsed = JSON.parse(json);
    return { isExplainer: !!parsed.is_explainer, topic: parsed.topic || null, reason: parsed.reason || '' };
  } catch {
    return { isExplainer: false, topic: null, reason: 'parse_error' };
  }
}

const fresh = [];
const CONCURRENCY = 6;
let i = 0;
async function worker() {
  while (i < toClassify.length) {
    const idx = i++;
    const conv = toClassify[idx];
    try {
      const r = await classify(conv);
      fresh.push({ uuid: conv.uuid, title: conv.name, ...r });
      if (r.isExplainer) console.log(`  ✓ ${(conv.name || '').slice(0, 60)} — ${r.topic}`);
    } catch (e) {
      console.warn(`  ✗ ${conv.uuid}: ${e.message}`);
      fresh.push({ uuid: conv.uuid, title: conv.name, isExplainer: false, error: e.message });
    }
    if ((idx + 1) % 20 === 0) console.log(`  ... ${idx + 1}/${toClassify.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Merge cached + fresh, restricted to current conversation set.
const currentUuids = new Set(convs.map(c => c.uuid));
const results = [...cached.filter(c => currentUuids.has(c.uuid)), ...fresh];

const explainers = results.filter(r => r?.isExplainer);
await fs.writeFile(path.join(DATA_DIR, 'classifications.json'), JSON.stringify(results, null, 2));
await fs.writeFile(path.join(DATA_DIR, 'explainers.json'), JSON.stringify(explainers, null, 2));
console.log(`\n✓ ${explainers.length} explainers out of ${convs.length}`);
console.log(`  → ${path.join(DATA_DIR, 'explainers.json')}`);
