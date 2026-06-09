/*
 * session.ts — per-connection browsing state and command dispatch.
 * History keeps the built frame, so BACK replays instantly with no re-fetch.
 */

import { fetchPage, looksLikeUrl, normalizeUrl, type Extracted } from './extract.ts';
import { readerify, searchPage, aboutPage } from './claude.ts';
import { buildFrame, encodeFrame, encodeError, encodeStatus, type Frame } from './page.ts';

interface Entry {
  url: string;
  page: Extracted | null;   // null for search/welcome pages
  frame: Frame;
}

const WELCOME = `T macinclaude surf
P A reader-mode web browser for the Macintosh Plus. The Mac mini fetches the page, Claude strips it to clean text, and only that crosses the 9600-baud wire.
B
H how to drive it
- Browse > Open Location (Cmd-L): type a URL, or plain words to search the web
- click any underlined link to follow it (or its number is all that matters)
- Browse > Summarize (Cmd-U): this page in one screen
- Browse > Ask... : ask a question about the page you are reading
- Browse > Back (Cmd-B): previous page
B
H good first stops
L https://text.npr.org | NPR text-only news
L https://news.ycombinator.com | Hacker News
L https://en.wikipedia.org/wiki/Macintosh_Plus | Wikipedia: Macintosh Plus
L https://lite.cnn.com | CNN lite
`;

export class Session {
  private history: Entry[] = [];
  private out: (s: string) => void;

  constructor(write: (s: string) => void) {
    this.out = write;
  }

  private current(): Entry | null {
    return this.history.length ? this.history[this.history.length - 1] : null;
  }

  sendWelcome(): void {
    const frame = buildFrame(WELCOME);
    this.history = [{ url: 'about:welcome', page: null, frame }];
    this.out(encodeFrame(frame));
  }

  private async navigate(url: string): Promise<void> {
    this.out(encodeStatus(`fetching ${new URL(url).host}...`));
    const page = await fetchPage(url);
    this.out(encodeStatus('distilling...'));
    const blocks = await readerify(page);
    const frame = buildFrame(blocks, (u) => {
      try { return new URL(u, page.url).toString(); } catch { return ''; }
    });
    this.history.push({ url: page.url, page, frame });
    this.out(encodeFrame(frame));
  }

  private async search(query: string): Promise<void> {
    this.out(encodeStatus('searching...'));
    const blocks = await searchPage(query);
    const frame = buildFrame(blocks);
    this.history.push({
      url: `search:${query}`,
      page: { url: `search:${query}`, title: `search: ${query}`, text: blocks, links: [] },
      frame,
    });
    this.out(encodeFrame(frame));
  }

  async handle(line: string): Promise<void> {
    const cmd = line.trim();
    if (!cmd) return;
    console.error(`[surf ${new Date().toISOString()}] cmd: ${JSON.stringify(cmd)}`);
    const m = cmd.match(/^(\S+)\s*(.*)$/s);
    if (!m) return;
    const verb = m[1].toUpperCase();
    const arg = m[2].trim();

    try {
      switch (verb) {
        case 'GO': {
          if (!arg) { this.out(encodeError('GO needs a url or search words')); return; }
          if (looksLikeUrl(arg)) await this.navigate(normalizeUrl(arg));
          else await this.search(arg);
          return;
        }
        case 'LINK': {
          const cur = this.current();
          const n = parseInt(arg, 10);
          const url = cur?.frame.links.get(n);
          if (!url) { this.out(encodeError(`no link ${arg} on this page`)); return; }
          await this.navigate(url);
          return;
        }
        case 'BACK': {
          if (this.history.length < 2) { this.out(encodeError('no page to go back to')); return; }
          this.history.pop();
          this.out(encodeFrame(this.current()!.frame));
          return;
        }
        case 'SUM':
        case 'ASK': {
          const cur = this.current();
          if (!cur || !cur.page) { this.out(encodeError('no page loaded yet')); return; }
          if (verb === 'ASK' && !arg) { this.out(encodeError('ASK needs a question')); return; }
          this.out(encodeStatus(verb === 'SUM' ? 'summarizing...' : 'thinking...'));
          const blocks = await aboutPage(
            cur.page,
            verb === 'SUM' ? 'summarize' : 'ask',
            arg || undefined
          );
          const frame = buildFrame(blocks);
          this.history.push({ url: cur.url, page: cur.page, frame });
          this.out(encodeFrame(frame));
          return;
        }
        default:
          this.out(encodeError(`unknown command ${verb} (GO/LINK/BACK/SUM/ASK)`));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.out(encodeError(msg.slice(0, 180)));
    }
  }
}
