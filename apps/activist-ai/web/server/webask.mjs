// What a web approval is about: the search words, the address or the reference in an `ola-search` /
// `ola-fetch` / `ola-lookup` command the agent asked to run. One parser for the page (the question it shows) and the front
// desk (the one-time grant it writes for the gateway), so the person approves exactly what the
// gateway will let through.
//
// A command is read the way the shell would for the simple case only: words, 'single' and
// "double" quotes, backslash escapes. Anything the shell would expand or chain ($, `, ;, &, |, <, >,
// a newline outside single quotes) makes it "not simple": the page then shows the exact command,
// and no one-time grant is written for it (the gateway refuses, and ola-search says to run it on
// its own). The gateway normalizes the same way (gateway/web.mjs searchItem, fetchItem).

/** The shell words of a simple command, or null. */
export function shellWords(cmd) {
  if (typeof cmd !== 'string' || cmd.length > 8192) return null
  const words = []
  let cur = ''
  let has = false
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]
    if (c === "'") {
      const end = cmd.indexOf("'", i + 1)
      if (end < 0) return null
      cur += cmd.slice(i + 1, end)
      has = true
      i = end
    } else if (c === '"') {
      i++
      for (; i < cmd.length && cmd[i] !== '"'; i++) {
        if (cmd[i] === '$' || cmd[i] === '`') return null
        if (cmd[i] === '\\' && i + 1 < cmd.length && '"\\$`\n'.includes(cmd[i + 1])) i++
        cur += cmd[i]
      }
      if (i >= cmd.length) return null
      has = true
    } else if (c === '\\') {
      if (i + 1 >= cmd.length) return null
      cur += cmd[++i]
      has = true
    } else if (c === ' ' || c === '\t') {
      if (has) words.push(cur), (cur = ''), (has = false)
    } else if ('$`;&|<>()\n\r{}'.includes(c)) return null
    else (cur += c), (has = true)
  }
  if (has) words.push(cur)
  return words
}

const TOOLS = { 'ola-search': 'search', '/opt/ola/bin/ola-search': 'search', 'ola-fetch': 'fetch', '/opt/ola/bin/ola-fetch': 'fetch', 'ola-lookup': 'lookup', '/opt/ola/bin/ola-lookup': 'lookup' }

/**
 * The web request in one command: { kind: 'search', item: words } or { kind: 'fetch', item: address },
 * { kind, item: null } for one of our tools in a form that is not simple, or null for anything else.
 */
export function webRequestOf(cmd) {
  const first = String(cmd ?? '').trim().split(/\s+/)[0]
  const kind = TOOLS[first]
  if (!kind) return null
  const w = shellWords(String(cmd).trim())
  if (!w || TOOLS[w[0]] !== kind) return { kind, item: null }
  const rest = []
  for (let i = 1; i < w.length; i++) {
    if (kind === 'search' && w[i] === '--count') i++
    else if (kind === 'fetch' && w[i] === '--as') i++
    else if (kind === 'lookup' && w[i] === '--json') continue
    else rest.push(w[i])
  }
  // A lookup is one reference (a citation or a DOI), normalized like a search (gateway/web.mjs).
  if (kind === 'search' || kind === 'lookup') {
    const q = rest.join(' ').replace(/\s+/g, ' ').trim()
    return { kind, item: q || null }
  }
  if (rest.length !== 1) return { kind, item: null }
  try {
    const u = new URL(rest[0].trim())
    return { kind, item: u.protocol === 'https:' ? u.href : null }
  } catch {
    return { kind, item: null }
  }
}

/** Every web request in a permission's resources (shell commands), in order. */
export function webRequests(action, resources) {
  if (action !== 'shell' && action !== 'bash') return []
  return (Array.isArray(resources) ? resources : []).map(webRequestOf).filter(Boolean)
}

/** opencode permission rules that make our two tools ask (or, once a project said always, run). */
export function webRules(effect) {
  const out = []
  for (const action of ['shell', 'bash']) for (const tool of Object.keys(TOOLS)) out.push({ action, resource: `${tool} *`, effect })
  return out
}
