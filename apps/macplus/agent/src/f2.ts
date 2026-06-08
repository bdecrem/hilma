/*
 * F2 knowledge tools for Macinclaude.
 *
 * Read-only access to Bart's F2 datastore (the `f2_threads` table on Supabase)
 * so the Plus can answer "what was that article/doc about" from saved reading.
 * A "topic" is one thing Bart sent into F2 — a web page, a video, pasted text,
 * or a chat — with its fetched content, any extra sources, and captured quotes.
 *
 * Surfaced to the agent as three in-process MCP tools (mcp__f2__list_topics /
 * search / get_topic). They run on the mini (fast side); the agent SUMMARIZES
 * the result for the 9600-baud Plus per the PLUS output rules — these tools may
 * hand back a few KB of content and that must never be pasted to the terminal.
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_KEY in the environment (service key =
 * full read, same as the web backend's f2Supabase()). The store is single-user
 * today (every row is Bart's), so there is no per-user scoping here. If that
 * ever changes, filter by user_id before trusting this as "Bart's knowledge".
 */
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

let _client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key)
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set — F2 knowledge tools unavailable');
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _client;
}

type Quote = { text: string; created_at?: string };
type Source = { url?: string; title?: string; content?: string };
type Message = { role: string; text: string };
type Thread = {
  id: string;
  topic: string | null;
  url: string | null;
  content: string | null;
  kind: string;
  updated_at: string;
  quotes: Quote[] | null;
  additional_sources: Source[] | null;
  messages: Message[] | null;
};

const COLS = 'id,topic,url,content,kind,updated_at,quotes,additional_sources,messages';

// Render a chat thread's messages compactly. Chat-kind topics keep their
// substance here (not in `content`), so the librarian needs them.
const renderMsgs = (msgs: Message[] | null, cap: number) => {
  const text = (msgs || [])
    .map((m) => `${m.role === 'user' ? 'Q' : 'A'}: ${(m.text || '').replace(/\s+/g, ' ').trim()}`)
    .filter((l) => l.length > 3)
    .join('\n');
  return text.length > cap ? `${text.slice(0, cap)}\n...[truncated]` : text;
};

const title = (t: Thread) => (t.topic || t.url || '(untitled)').trim();
const shortId = (t: Thread) => t.id.slice(0, 8);
const day = (s: string) => (s || '').slice(0, 10);
const ok = (text: string) => ({ content: [{ type: 'text' as const, text }] });

async function fetchAll(): Promise<Thread[]> {
  const { data, error } = await db()
    .from('f2_threads')
    .select(COLS)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as Thread[];
}

const listTopics = tool(
  'list_topics',
  "List every topic saved in the F2 knowledge store — Bart's saved reading (web pages, videos, pasted notes, chats). Returns short id, kind, title and last-updated date for each. Use this to browse what is available.",
  {},
  async () => {
    const rows = await fetchAll();
    if (!rows.length) return ok('F2 store is empty.');
    const lines = rows.map((t) => `${shortId(t)} [${t.kind}] ${title(t)} (${day(t.updated_at)})`);
    return ok(`F2 topics (${rows.length}):\n${lines.join('\n')}`);
  }
);

const search = tool(
  'search',
  'Search the F2 knowledge store by keyword across topic titles, fetched article content, captured quotes, and extra sources. Returns matching topics ranked, each with a short snippet around the first match. Use for "what was that doc/article about X" questions.',
  { query: z.string().describe('keywords to search for, e.g. "independent writing"') },
  async ({ query }) => {
    const q = query.toLowerCase().trim();
    if (!q) return ok('empty query');
    const terms = q.split(/\s+/).filter(Boolean);
    const rows = await fetchAll();
    const scored: { t: Thread; score: number; hay: string }[] = [];
    for (const t of rows) {
      const hay = [
        title(t),
        t.content || '',
        renderMsgs(t.messages, 100000),
        (t.quotes || []).map((x) => x.text).join(' '),
        (t.additional_sources || []).map((s) => `${s.title || ''} ${s.content || ''}`).join(' '),
      ]
        .join('\n')
        .toLowerCase();
      const tl = title(t).toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (hay.includes(term)) score += 1;
        if (tl.includes(term)) score += 2; // title hits weigh more
      }
      if (score > 0) scored.push({ t, score, hay });
    }
    if (!scored.length) return ok(`No F2 topics match "${query}".`);
    scored.sort((a, b) => b.score - a.score);
    const out = scored.slice(0, 8).map(({ t, hay }) => {
      const idx = hay.indexOf(terms[0]);
      const snip =
        idx >= 0 ? hay.slice(Math.max(0, idx - 60), idx + 120).replace(/\s+/g, ' ').trim() : '';
      return `${shortId(t)} [${t.kind}] ${title(t)}${snip ? `\n   ...${snip}...` : ''}`;
    });
    return ok(`Matches for "${query}":\n${out.join('\n')}`);
  }
);

const getTopic = tool(
  'get_topic',
  'Get full detail of one F2 topic by its short id (from list_topics/search) or a title substring: source URL, the saved content, extra sources, and captured quotes. Content can be long — SUMMARIZE it for the user, never paste it verbatim to the Plus.',
  { topic: z.string().describe('an 8-char id from list_topics/search, or part of the title') },
  async ({ topic }) => {
    const key = topic.toLowerCase().trim();
    const rows = await fetchAll();
    const t =
      rows.find((r) => r.id.toLowerCase().startsWith(key)) ||
      rows.find((r) => title(r).toLowerCase().includes(key));
    if (!t) return ok(`No F2 topic matches "${topic}". Try list_topics.`);
    const parts = [`TITLE: ${title(t)}`, `KIND: ${t.kind}   UPDATED: ${day(t.updated_at)}`];
    if (t.url) parts.push(`SOURCE: ${t.url}`);
    const content = (t.content || '').trim();
    if (content)
      parts.push(
        `\nCONTENT (${content.length} chars, summarize for the user):\n${content.slice(0, 4000)}${
          content.length > 4000 ? '\n...[truncated]' : ''
        }`
      );
    const chat = renderMsgs(t.messages, 4000);
    if (chat) parts.push(`\nCHAT (summarize for the user):\n${chat}`);
    const add = t.additional_sources || [];
    if (add.length)
      parts.push(
        `\nADDITIONAL SOURCES (${add.length}):\n` +
          add.map((s) => `- ${(s.title || s.url || '').trim()} ${s.url || ''}`.trim()).join('\n')
      );
    const quotes = t.quotes || [];
    if (quotes.length)
      parts.push(`\nQUOTES (${quotes.length}):\n` + quotes.map((qz) => `- "${qz.text}"`).join('\n'));
    return ok(parts.join('\n'));
  }
);

// Exported for tests; also bundled into the server below.
export const f2Tools = [listTopics, search, getTopic];

export function createF2Server() {
  return createSdkMcpServer({
    name: 'f2',
    version: '0.1.0',
    tools: f2Tools,
    alwaysLoad: true, // keep the 3 tools in-prompt, never deferred behind tool-search
  });
}
