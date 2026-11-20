// Publish from the conversation (OLA-230): the agent in a cloud project runs
//
//   ola-publish <folder | page.html> --files index.html,style.css,…
//
// as a command of its own. opencode asks the person first, always, whatever "Lots of permissions"
// says (proxy.mjs permissionsFor). The page shows that question as the Publish sheet's list (the
// files that would go public, the address) and sends the fingerprint of the list it showed; the
// Mac and iPhone apps show the command, whose --files is the list. On the person's yes the front
// desk publishes (frontdesk/chatpublish.mjs, the same prepare() and checks as the Publish button)
// and hands the outcome to the waiting command inside the project's computer, which prints it for
// the agent. One parser for the page and the front desk, so both read the command the same way.
import { shellWords } from './webask.mjs'

const TOOLS = new Set(['ola-publish', '/opt/ola/bin/ola-publish'])

/** True when a shell command is (or starts as) a call of ola-publish. */
export const isPublishCommand = (cmd) => TOOLS.has(String(cmd ?? '').trim().split(/\s+/)[0])

/**
 * What a publish command asks for: { sel: { folder } | { page }, files: [...] } for a simple call,
 * { status: true } for `ola-publish status` (never asked), { bad: sentence } for one of ours in a
 * form the front desk will not act on, or null for any other command.
 */
export function publishRequestOf(cmd) {
  if (!isPublishCommand(cmd)) return null
  const w = shellWords(String(cmd).trim())
  if (!w || !TOOLS.has(w[0])) return { bad: 'Run ola-publish as a command of its own, with nothing before or after it (no pipes, ; or &&).' }
  if (w[1] === 'status' && w.length === 2) return { status: true }
  let target = null
  let files = null
  for (let i = 1; i < w.length; i++) {
    if (w[i] === '--files') {
      if (files !== null || i + 1 >= w.length) return { bad: 'Name the files once, after --files, separated by commas.' }
      files = w[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (w[i].startsWith('-') || target !== null) return { bad: `ola-publish takes one folder (or one page) and --files; “${w[i]}” is not one of those.` }
    else target = w[i].replace(/^\/work\//, '').replace(/^\.\//, '').replace(/\/+$/, '')
  }
  if (!target) return { bad: 'Name the folder to publish: ola-publish site --files index.html,…' }
  if (!files?.length) return { bad: 'List every file that will be public after --files (the list from publish.py check), so the person sees exactly what goes.' }
  if (files.length > 500 || files.some((f) => f.length > 300)) return { bad: 'That list of files is too long for one publish.' }
  return { sel: /\.html?$/i.test(target) ? { page: target } : { folder: target }, files }
}

/** The publish request in a permission's resources: exactly one command, and it is ola-publish. */
export function publishAskOf(action, resources) {
  if (action !== 'shell' && action !== 'bash') return null
  const list = Array.isArray(resources) ? resources : []
  if (!list.some(isPublishCommand)) return null
  if (list.length !== 1) return { bad: 'Run ola-publish as a command of its own.' }
  return publishRequestOf(list[0])
}

/** The same list, whatever the order: the files the command named and the files that would go. */
export const sameFiles = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n')

/**
 * opencode permission rules: a publish is always asked (it leaves the machine and is public), its
 * `status` never is. Last in the session's rules, so they win over "Lots of permissions".
 */
export function publishRules() {
  const out = []
  for (const action of ['shell', 'bash'])
    for (const tool of TOOLS) {
      out.push({ action, resource: tool, effect: 'ask' }, { action, resource: `${tool} *`, effect: 'ask' })
      out.push({ action, resource: `${tool} status`, effect: 'allow' })
    }
  return out
}
