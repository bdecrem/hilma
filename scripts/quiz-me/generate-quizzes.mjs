#!/usr/bin/env node
// For each explainer conversation, generate a quiz (5 questions) using Sonnet.

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');

const envPath = path.join(__dirname, '..', '..', '.env.local');
try {
  const env = await fs.readFile(envPath, 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const explainers = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'explainers.json'), 'utf8'));
const convsAll = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'conversations.json'), 'utf8'));
const byUuid = new Map(convsAll.map(c => [c.uuid, c]));

// Cache: keep existing quizzes, only generate for explainers that don't have one yet.
let existing = [];
try {
  existing = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'quizzes.json'), 'utf8'));
} catch {}
const existingByUuid = new Map(existing.map(q => [q.id, q]));
const pending = explainers.filter(e => !existingByUuid.has(e.uuid));

console.log(`→ ${explainers.length} explainers; ${existingByUuid.size} cached quizzes, ${pending.length} new`);

function flatten(conv) {
  const msgs = Array.isArray(conv.chat_messages) ? conv.chat_messages : [];
  return msgs.map(m => {
    const text = (m.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
    return { role: m.sender, text };
  });
}

function transcript(conv, maxChars = 30000) {
  const msgs = flatten(conv);
  let s = '';
  for (const m of msgs) {
    const chunk = `\n\n[${m.role.toUpperCase()}]\n${m.text}`;
    if (s.length + chunk.length > maxChars) { s += '\n\n[...truncated]'; break; }
    s += chunk;
  }
  return s;
}

async function makeQuiz(conv, topic) {
  const text = transcript(conv);
  const r = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: `You turn a conversation where Claude explained a concept into a short quiz that tests the user's understanding and recall.

Rules:
- 5 questions total.
- Mix: 3 multiple-choice (4 options each), 2 short-answer.
- Test the CORE concepts from the explanation — not trivia, not Claude's wording.
- Each question must have a correct answer that is clearly supported by the explanation.
- For short-answer: provide an accepted-answer sentence and a list of 3-6 key terms that must appear (any form) to count as correct.
- Difficulty: enough to prove real understanding, not a gotcha.

Output ONLY JSON matching this schema:
{
  "topic": "string",
  "summary": "one-paragraph recap of what was explained",
  "questions": [
    {"type": "mcq", "q": "...", "options": ["A","B","C","D"], "answer_index": 0, "explanation": "why"},
    {"type": "short", "q": "...", "accepted_answer": "...", "key_terms": ["...", "..."], "explanation": "why"}
  ]
}`,
    messages: [{ role: 'user', content: `Topic (hint): ${topic || 'unknown'}\n\nConversation transcript:\n${text}` }],
  });
  const raw = r.content[0]?.text ?? '{}';
  const json = raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}';
  return JSON.parse(json);
}

const fresh = [];
const CONCURRENCY = 4;
let i = 0;
async function worker() {
  while (i < pending.length) {
    const idx = i++;
    const e = pending[idx];
    const conv = byUuid.get(e.uuid);
    if (!conv) continue;
    try {
      const quiz = await makeQuiz(conv, e.topic);
      fresh.push({
        id: conv.uuid,
        title: conv.name || quiz.topic || e.topic || 'Untitled',
        topic: quiz.topic || e.topic,
        source_created_at: conv.created_at,
        summary: quiz.summary,
        questions: quiz.questions,
      });
      console.log(`  ✓ ${(conv.name || e.topic || '').slice(0, 60)}`);
    } catch (err) {
      console.warn(`  ✗ ${conv.uuid}: ${err.message}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const explainerUuids = new Set(explainers.map(e => e.uuid));
const quizzes = [
  ...existing.filter(q => explainerUuids.has(q.id)),
  ...fresh,
];

quizzes.sort((a, b) => (b.source_created_at || '').localeCompare(a.source_created_at || ''));
await fs.writeFile(path.join(DATA_DIR, 'quizzes.json'), JSON.stringify(quizzes, null, 2));

// Also write a public copy so the Next.js UI can fetch it statically.
const publicDir = path.join(__dirname, '..', '..', 'public', 'quiz-data');
await fs.mkdir(publicDir, { recursive: true });
await fs.writeFile(path.join(publicDir, 'quizzes.json'), JSON.stringify(quizzes, null, 2));

console.log(`\n✓ ${quizzes.length} quizzes → ${path.join(DATA_DIR, 'quizzes.json')}`);
console.log(`  + public copy → public/quiz-data/quizzes.json`);
