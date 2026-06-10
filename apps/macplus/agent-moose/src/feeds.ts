/*
 * feeds.ts — the real-world material the character riffs on.
 *  - Hacker News: live, public, no credentials (the guaranteed demo).
 *  - Briefing file: optional ~/.talking-plus/briefing.json the user populates
 *    from their own calendar/inbox tooling; read if present, ignored if not.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface Story { title: string; by: string; score: number; descendants: number }

export async function topHackerNews(n = 8): Promise<Story[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    const idsResp = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
      signal: ctl.signal,
    });
    const ids: number[] = await idsResp.json();
    const top = ids.slice(0, n);
    const stories = await Promise.all(
      top.map(async (id) => {
        const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
          signal: ctl.signal,
        });
        const it = await r.json();
        return {
          title: String(it?.title ?? '').slice(0, 140),
          by: String(it?.by ?? ''),
          score: Number(it?.score ?? 0),
          descendants: Number(it?.descendants ?? 0),
        } as Story;
      })
    );
    return stories.filter((s) => s.title);
  } finally {
    clearTimeout(timer);
  }
}

export interface Briefing {
  date?: string;
  calendar?: { time?: string; title: string }[];
  inbox?: { from?: string; subject: string }[];
  note?: string;
}

/** Read the optional briefing file; returns null if absent/unreadable. */
export async function readBriefing(): Promise<Briefing | null> {
  const path = process.env.TALKING_PLUS_BRIEFING || join(homedir(), '.talking-plus', 'briefing.json');
  try {
    const text = await readFile(path, 'utf8');
    const b = JSON.parse(text) as Briefing;
    return b && typeof b === 'object' ? b : null;
  } catch {
    return null;
  }
}

export function briefingToText(b: Briefing): string {
  const parts: string[] = [];
  if (b.date) parts.push(`Today is ${b.date}.`);
  if (b.calendar?.length) {
    parts.push(
      `Calendar (${b.calendar.length}): ` +
        b.calendar.map((e) => (e.time ? `${e.time} ${e.title}` : e.title)).join('; ')
    );
  } else if (b.calendar) {
    parts.push('Calendar: nothing scheduled.');
  }
  if (b.inbox?.length) {
    parts.push(
      `Inbox (${b.inbox.length} notable): ` +
        b.inbox.map((m) => (m.from ? `${m.from}: ${m.subject}` : m.subject)).join('; ')
    );
  }
  if (b.note) parts.push(`Note: ${b.note}`);
  return parts.join('\n');
}
