/*
 * claude.ts — the three Claude calls.
 * All return raw SRF-ish block text (T/H/P/Q/-/B lines, links as
 * "L <url> | <text>") which page.ts then sanitizes into a legal frame.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Extracted } from './extract.ts';

const MODEL = process.env.SURF_MODEL || 'claude-opus-4-8';

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const FORMAT_RULES = `
Output ONLY lines in this exact format (no markdown, no commentary, no blank-line padding beyond B lines):
T <page title>                (exactly one, first line)
H <section heading>
P <paragraph text>
Q <quoted text>
- <bullet item>
L <absolute url> | <link label>
B                             (vertical gap, sparingly)
Plain 7-bit ASCII only: straight quotes, -- for dashes, no emoji, no unicode.
Keep total output under 9000 characters.`;

function textOf(resp: Anthropic.Message): string {
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  // Models sometimes narrate before the page ("I'll search...", "Here is...").
  // The page proper starts at the T line — drop anything before it.
  const t = text.search(/^T /m);
  return t > 0 ? text.slice(t) : text;
}

/** Reader-mode: rough extracted page -> clean SRF blocks. */
export async function readerify(page: Extracted): Promise<string> {
  const linkList = page.links
    .slice(0, 120)
    .map((l) => `${l.url} | ${l.text}`)
    .join('\n');

  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: `You convert scraped web pages into clean reader-mode text for a 1986 Macintosh Plus with a tiny 1-bit screen on a 9600-baud link. You are the entire rendering engine: whatever you emit is exactly what the reader sees.

Your job:
- Reconstruct the MAIN content (article body, post, documentation, listing) from the rough scrape. Keep the actual content close to verbatim; fix scrape artifacts.
- DROP navigation menus, cookie/consent text, ads, share buttons, subscribe prompts, footers, "related articles" padding.
- Use H for the page's real section headings, Q for quotes, - for list items.
- From the link list provided, keep ONLY the genuinely useful links (next page, the articles a front page points to, key references) — at most 25, each as: L <absolute url> | <short label>. For a news front page or index page, the links ARE the content: emit the headlines as links.
- If the page is paywalled/empty/blocked, say so in one P line rather than inventing content.
${FORMAT_RULES}`,
    messages: [
      {
        role: 'user',
        content: `URL: ${page.url}\nTITLE: ${page.title}\n\nROUGH PAGE TEXT:\n${page.text}\n\nLINKS ON PAGE (url | anchor text):\n${linkList}`,
      },
    ],
  });
  return textOf(resp);
}

/** Web search: query -> SRF results page (uses the server-side web_search tool). */
export async function searchPage(query: string): Promise<string> {
  let messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Search the web for: ${query}\n\nThen emit a results page: a T title line ("search: ..."), one P line summarizing what you found in 1-2 sentences, then the best 8-12 results, each as an L line (L <absolute url> | <result title>) optionally followed by one short P line of description. Prefer primary sources and text-friendly pages.${FORMAT_RULES}`,
    },
  ];

  let resp = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    tools: [{ type: 'web_search_20260209', name: 'web_search' }],
    messages,
  });

  // server-side tool loop can pause; resume until done (bounded)
  for (let i = 0; i < 5 && resp.stop_reason === 'pause_turn'; i++) {
    messages = [...messages, { role: 'assistant', content: resp.content }];
    resp = await client().messages.create({
      model: MODEL,
      max_tokens: 8000,
      tools: [{ type: 'web_search_20260209', name: 'web_search' }],
      messages,
    });
  }
  return textOf(resp);
}

/** Summarize or answer a question about the current page. */
export async function aboutPage(
  page: Extracted,
  mode: 'summarize' | 'ask',
  question?: string
): Promise<string> {
  const task =
    mode === 'summarize'
      ? 'Summarize this page in at most 12 short lines (P and - lines). Lead with the core point.'
      : `Answer this question using the page content (say plainly if the page does not answer it): ${question}`;

  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: `You answer about a web page for a reader on a 1986 Macintosh Plus. Be brief and concrete.${FORMAT_RULES}`,
    messages: [
      {
        role: 'user',
        content: `${task}\n\nURL: ${page.url}\nTITLE: ${page.title}\n\nPAGE TEXT:\n${page.text.slice(0, 50_000)}`,
      },
    ],
  });
  return textOf(resp);
}
