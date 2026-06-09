/*
 * extract.ts — fetch a URL and strip it to rough text + an absolute link list.
 * No HTML parser dependency: scripts/styles dropped, block tags become
 * paragraph breaks, anchors collected with resolved hrefs. The output is rough
 * on purpose — Claude does the actual reader-mode cleanup.
 */

const UA =
  'Mozilla/5.0 (Macintosh; 68000 Mac Plus via Macinclaude Surf) AppleWebKit/537.36';

export interface Extracted {
  url: string;          // final URL after redirects
  title: string;
  text: string;         // rough text, paragraph breaks as \n\n
  links: { url: string; text: string }[];
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '--', ndash: '-', hellip: '...', rsquo: "'", lsquo: "'",
  rdquo: '"', ldquo: '"', copy: '(c)', reg: '(r)', trade: '(tm)',
  middot: '*', bull: '*', deg: ' deg', amp_: '&',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X'
        ? parseInt(ent.slice(2), 16)
        : parseInt(ent.slice(1), 10);
      if (!Number.isFinite(code)) return whole;
      try { return String.fromCodePoint(code); } catch { return whole; }
    }
    return ENTITIES[ent.toLowerCase()] ?? whole;
  });
}

export function stripHtml(html: string, baseUrl: string): Omit<Extracted, 'url'> {
  // kill the noise wholesale
  let h = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, ' ')
    .replace(/<template\b[\s\S]*?<\/template\s*>/gi, ' ');

  const titleM = h.match(/<title[^>]*>([\s\S]*?)<\/title\s*>/i);
  const title = titleM ? decodeEntities(titleM[1]).replace(/\s+/g, ' ').trim() : '';

  // collect anchors before stripping tags
  const links: { url: string; text: string }[] = [];
  const seen = new Set<string>();
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  let am: RegExpExecArray | null;
  while ((am = anchorRe.exec(h)) !== null && links.length < 400) {
    const attrs = am[1];
    const hrefM = attrs.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!hrefM) continue;
    const href = (hrefM[2] ?? hrefM[3] ?? hrefM[4] ?? '').trim();
    if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) continue;
    let abs: string;
    try { abs = new URL(href, baseUrl).toString(); } catch { continue; }
    if (!/^https?:/i.test(abs)) continue;
    const text = decodeEntities(am[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const key = abs + '|' + text;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ url: abs, text: text.slice(0, 120) });
  }

  // structure -> breaks, then strip every remaining tag
  h = h
    .replace(/<\/(p|div|section|article|header|footer|h[1-6]|li|tr|blockquote|pre|figcaption)\s*>/gi, '\n\n')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<(h[1-6])\b[^>]*>/gi, '\n\n## ')
    .replace(/<blockquote\b[^>]*>/gi, '\n\n> ')
    .replace(/<[^>]+>/g, ' ');

  const text = decodeEntities(h)
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, text, links };
}

export async function fetchPage(url: string): Promise<Extracted> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25_000);
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${new URL(resp.url || url).host}`);
    const ctype = resp.headers.get('content-type') ?? '';
    if (ctype && !/text\/html|application\/xhtml|text\/plain/i.test(ctype))
      throw new Error(`not a web page (${ctype.split(';')[0]})`);
    let body = await resp.text();
    if (body.length > 1_500_000) body = body.slice(0, 1_500_000);
    const finalUrl = resp.url || url;
    if (/text\/plain/i.test(ctype)) {
      return { url: finalUrl, title: finalUrl, text: body.slice(0, 60_000), links: [] };
    }
    const stripped = stripHtml(body, finalUrl);
    return { url: finalUrl, ...stripped, text: stripped.text.slice(0, 60_000) };
  } finally {
    clearTimeout(timer);
  }
}

/** Does this look like a URL (vs search words)? */
export function looksLikeUrl(s: string): boolean {
  if (/^https?:\/\//i.test(s)) return true;
  if (/\s/.test(s.trim())) return false;
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/\S*)?$/i.test(s.trim());
}

export function normalizeUrl(s: string): string {
  return /^https?:\/\//i.test(s) ? s : 'https://' + s;
}
