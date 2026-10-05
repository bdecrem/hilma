// The documents behind /osai, read from apps/osai/content at request time.
// core.md is generated from the Pages one-pager by scripts/osai/slurp.mjs;
// map.md is a copy of docsrepo/opensourceai/public-benefit-ai-map.md;
// resources.txt is a copy of docsrepo/opensourceai/page2.txt and resources/
// of docsrepo/opensourceai/resources/ (the same script copies all of them).
// next.config.ts traces the folder into the /osai pages and the chat route.

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { joinResources, parseResourceDoc, parseResourceList, type Resource } from './resources'

const DIR = path.join(process.cwd(), 'apps', 'osai', 'content')
const cache = new Map<string, string>()

function read(name: string): string {
  if (process.env.NODE_ENV === 'production') {
    const hit = cache.get(name)
    if (hit !== undefined) return hit
  }
  const text = readFileSync(path.join(DIR, name), 'utf8')
  cache.set(name, text)
  return text
}

export function coreMarkdown(): string {
  return read('core.md')
}

export function mapMarkdown(): string {
  return read('map.md')
}

/** The date stamp the slurp script wrote into core.md, if any. */
export function coreStamp(): string | null {
  const m = coreMarkdown().match(/on (\d{4}-\d{2}-\d{2})\./)
  return m ? m[1] : null
}

/** The reading list (page 2), with the text of each linked document attached where there is one. */
export function resources(): Resource[] {
  let list = ''
  try {
    list = read('resources.txt')
  } catch {
    return []
  }
  let names: string[] = []
  try {
    names = readdirSync(path.join(DIR, 'resources'))
      .filter((n) => n.endsWith('.md'))
      .sort()
  } catch {
    names = []
  }
  const docs = names.map((n) => parseResourceDoc(read(path.join('resources', n))))
  return joinResources(parseResourceList(list), docs)
}
