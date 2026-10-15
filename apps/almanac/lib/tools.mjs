// The agent's tools. No shell, no file system: it reads the corpus through read-only queries and writes only
// artifacts and coding runs. Every result starts with a one-line summary, which the chat shows as the step.
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { runDb } from './db.mjs'
import * as art from './artifacts.mjs'
import * as jobs from './jobs.mjs'
import * as store from './store.mjs'
import { CONFIRM_ABOVE } from './jobs.mjs'

const text = s => ({ content: [{ type: 'text', text: s }] })
const fail = s => ({ content: [{ type: 'text', text: `Error: ${s}` }], isError: true })
const safe = fn => async args => { try { return await fn(args) } catch (e) { return fail(String(e?.message || e)) } }
const plural = (n, w) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`
const asObjects = ({ columns, rows }) => rows.map(r => Object.fromEntries(columns.map((c, i) => [c, r[i]])))

export const TOOL_NAMES = ['sql', 'search', 'read_paper', 'save_table', 'save_chart', 'save_page', 'save_document',
  'list_artifacts', 'read_artifact', 'code_papers', 'job_status', 'cancel_job', 'resume_job']

export function almanacServer({ chatId, author, onArtifact }) {
  const made = (kind, id, title) => { onArtifact({ id, kind, title }); return `artifact:${id}` }
  const tools = [
    tool('sql', 'Run one read-only SQL query (SQLite) against the corpus. Use it for counts, filters, cross-tabs and to look up papers by their coded fields. Results over max_rows are cut off; aggregate in SQL or use save_table for long results.',
      { query: z.string().describe('one SELECT (or WITH ... SELECT) statement'), max_rows: z.number().int().min(1).max(2000).optional().describe('default 200') },
      safe(async ({ query, max_rows }) => {
        const r = await runDb('sql', { query, maxRows: max_rows ?? 200 })
        return text(`${plural(r.rows.length, 'row')}${r.more ? ' shown; more exist' : ''}\n` + JSON.stringify({ columns: r.columns, rows: r.rows }))
      })),

    tool('search', 'Full-text keyword search over every paper (title, GAMI summary and full text). SQLite FTS5 syntax: "exact phrase", AND, OR, NOT, prefix*, NEAR(a b, 10). Stemmed, so drought matches droughts. Returns papers by relevance with the best-matching page and a snippet.',
      { query: z.string(), where: z.string().optional().describe('extra SQL condition on the papers table, alias p, e.g. p.year >= 2018 or p.id IN (SELECT paper_id FROM tags WHERE field=\'region\' AND value=\'Africa\')'),
        limit: z.number().int().min(1).max(200).optional().describe('default 25') },
      safe(async ({ query, where, limit }) => {
        const r = await runDb('search', { query, where, limit: limit ?? 25 })
        const lines = r.papers.map(p => `${p.id} | ${p.year ?? 'n.d.'} | ${p.title} | ${(p.authors || '').split(';')[0]} | pages with hits: ${p.pages_with_hits} | best page ${p.page ?? '-'}: ${p.snippet}`)
        return text(`${plural(r.total, 'paper')} match ${query}; showing ${r.papers.length}\n` + lines.join('\n'))
      })),

    tool('read_paper', "Read a paper: its metadata, the GAMI coders' summary and its full text, page by page ([page N] markers). Ask for a page range on long papers.",
      { id: z.string().describe('paper id (GAMI Article.ID)'), pages: z.string().optional().describe('e.g. "1-3,9"; default all') },
      safe(async ({ id, pages }) => {
        const { meta, pages: pp } = await runDb('paper', { id, pages })
        const m = meta
        let body = pp.map(p => `[page ${p.page}]\n${p.text}`).join('\n\n')
        if (body.length > 250000) body = body.slice(0, 250000) + '\n…[cut; ask for a page range]'
        const head = [`${m.title} (${m.year ?? 'n.d.'}). ${m.authors || ''}. ${m.journal || ''}. id ${m.id}, ${m.pages ?? 0} pages, ${m.words ?? 0} words${m.doi ? `, doi ${m.doi}` : ''}`,
          `Coded: region ${m.region || '-'}; country ${m.country || '-'}; sector ${m.sector || '-'}; hazards ${m.hazards || '-'}; response ${m.response_type || '-'}; actors ${m.actors || '-'}; stage ${m.implementation_stage || '-'}`,
          `GAMI summary: ${m.summary || '-'}`].join('\n')
        return text(`${m.title.slice(0, 90)}: ${pp.length ? plural(pp.length, 'page') : 'no full text'}\n${head}\n\n${pp.length ? body : '(No full text for this paper: only the coded fields and summary above.)'}`)
      })),

    tool('save_table', 'Save a table as an artifact the user can open and download as Excel and CSV. Give sql (preferred: the full result is saved, up to 100,000 rows) or columns + rows.',
      { title: z.string(), description: z.string().describe('one or two sentences: what the table shows and how it was made'),
        sql: z.string().optional(), columns: z.array(z.string()).optional(), rows: z.array(z.array(z.unknown())).optional() },
      safe(async ({ title, description, sql, columns, rows }) => {
        let t = { columns, rows: rows || [] }
        if (sql) t = await runDb('rows', { query: sql }, { timeout: 120000 })
        const r = await art.saveTable({ chatId, author, title, description, columns: t.columns, rows: t.rows })
        return text(`Saved table "${title}": ${plural(r.rows, 'row')}.\nLink: [${title}](${made('table', r.id, title)})`)
      })),

    tool('save_chart', 'Save a chart as an artifact (Vega-Lite v6 spec). Give sql to fill the data (its rows become data.values; refer to its column names as fields) or put data.values in the spec. The house style (fonts, colours) is applied for you; set width/height in pixels or "container". The chart is rendered when saved, so a broken spec comes back as an error to fix.',
      { title: z.string(), description: z.string(), spec: z.record(z.string(), z.unknown()).describe('Vega-Lite spec without data, or with data.values'),
        sql: z.string().optional() },
      safe(async ({ title, description, spec, sql }) => {
        const rows = sql ? asObjects(await runDb('rows', { query: sql, maxRows: 20000 }, { timeout: 120000 })) : undefined
        const r = await art.saveChart({ chatId, author, title, description, spec, rows })
        return text(`Saved chart "${title}"${rows ? ` from ${plural(rows.length, 'row')}` : ''}.\nLink: [${title}](${made('chart', r.id, title)})`)
      })),

    tool('save_page', 'Save a self-contained web page (HTML with inline CSS, and inline JS if needed) as an artifact: a report, a browsable list, an interactive view. It opens in a sandboxed frame with no access to the app or the database, so put the data in the page.',
      { title: z.string(), description: z.string(), html: z.string() },
      safe(async ({ title, description, html }) => {
        const r = await art.savePage({ chatId, author, title, description, html })
        return text(`Saved page "${title}".\nLink: [${title}](${made('page', r.id, title)})`)
      })),

    tool('save_document', 'Save a written document (Markdown) as an artifact: a memo, a draft typology, a literature summary, notes for a paper. Cite papers inside it the same way as in chat.',
      { title: z.string(), description: z.string(), markdown: z.string() },
      safe(async ({ title, description, markdown }) => {
        const r = await art.saveDocument({ chatId, author, title, description, markdown })
        return text(`Saved document "${title}".\nLink: [${title}](${made('document', r.id, title)})`)
      })),

    tool('list_artifacts', 'List the saved artifacts (newest first), from every conversation.', {},
      safe(async () => {
        const all = store.artifacts.list()
        return text(`${plural(all.length, 'artifact')}\n` + all.slice(0, 100).map(a => `${a.id} | ${a.kind} | ${a.title} | ${a.created.slice(0, 10)} | ${a.description.slice(0, 160)}`).join('\n'))
      })),

    tool('read_artifact', 'Open a saved artifact: a table as CSV, a chart as its spec, a page as HTML, a document as Markdown.',
      { id: z.string() }, safe(async ({ id }) => text(await art.readArtifact(id)))),

    tool('code_papers', `Start a coding run: apply a coding sheet (fields) to many papers, one model call per paper, in the background. Every value comes with the exact supporting quote and page, and each quote is checked against the paper's text. Results go to the table almanac.codings (job_id, paper_id, item, field, value, quote, page, quote_found: 1 found on that page, 2 found on another page, 0 not found) and, when the run ends, to a table artifact. Runs over ${CONFIRM_ABOVE} papers come back asking for confirmation: tell the user the paper count and the token estimate, and only call again with confirmed: true after they say yes. Pilot new coding sheets on 10-20 papers first.`,
      {
        name: z.string().describe('short name for the run'),
        instructions: z.string().describe('what to code and how, as you would brief a research assistant'),
        unit: z.enum(['paper', 'list']).optional().describe('paper (default): one sheet per paper. list: one sheet per item found in the paper (e.g. each adaptation decision)'),
        item: z.string().optional().describe('for unit list: what one item is, e.g. "adaptation decision"'),
        fields: z.array(z.object({
          name: z.string().describe('lower_snake_case'), description: z.string(),
          type: z.enum(['text', 'category', 'number', 'boolean']),
          options: z.array(z.string()).optional().describe('for category'), multiple: z.boolean().optional().describe('category: allow several'),
        })),
        where: z.string().optional().describe('SQL condition on papers p choosing which papers'),
        ids: z.array(z.string()).optional().describe('explicit paper ids'),
        limit: z.number().int().min(1).optional(), sample: z.enum(['random', 'first']).optional().describe('default random'),
        source: z.enum(['full', 'summary']).optional().describe('full text (default; only papers with full text) or only the GAMI summary'),
        model: z.enum(['sonnet', 'opus', 'haiku']).optional().describe('default sonnet'),
        confirmed: z.boolean().optional(),
      },
      safe(async spec => {
        const r = await jobs.createJob({ chatId, author, spec })
        const tokens = `${(r.estTokens / 1e6).toFixed(r.estTokens < 1e6 ? 2 : 1)}M input tokens`
        if (r.needsConfirmation) return text(`Needs confirmation: ${plural(r.papers, 'paper')}, about ${tokens} on Bart's Max plan. Ask the user; call again with confirmed: true only after they agree.`)
        return text(`Started coding run ${r.id} "${spec.name}" on ${plural(r.papers, 'paper')} (about ${tokens}). It runs in the background; check it with job_status.`)
      })),

    tool('job_status', 'Progress and results of coding runs. With a job id: status, counts, how values are distributed for category and yes/no fields, the quote-check rate, and sample rows. Without: all runs.',
      { job: z.string().optional() },
      safe(async ({ job }) => {
        if (!job) {
          const all = store.jobs.list()
          return text(`${plural(all.length, 'coding run')}\n` + all.map(j => `${j.id} | ${j.name} | ${j.status} | ${j.done}/${j.total} done, ${j.errors} errors | ${j.created.slice(0, 16)}${j.artifact_id ? ` | artifact ${j.artifact_id}` : ''}`).join('\n'))
        }
        const j = store.jobs.get(job)
        if (!j) throw new Error(`no run ${job}`)
        const c = store.jobs.codings(job)
        const lines = [`Run ${j.id} "${j.name}": ${j.status}, ${j.done} of ${j.total} papers coded, ${j.errors} errors${j.error ? ` (${j.error})` : ''}${j.artifact_id ? `; results in artifact:${j.artifact_id}` : ''}`]
        const q = c.filter(x => x.quote_found != null)
        if (q.length) lines.push(`Quotes: ${q.filter(x => x.quote_found === 1).length} found on the stated page, ${q.filter(x => x.quote_found === 2).length} on another page, ${q.filter(x => x.quote_found === 0).length} not found, of ${q.length}.`)
        for (const f of j.spec.fields.filter(f => f.type !== 'text' && f.type !== 'number')) {
          const counts = {}
          for (const x of c.filter(x => x.field === f.name)) for (const v of String(x.value ?? 'null').split(' | ')) counts[v] = (counts[v] || 0) + 1
          lines.push(`${f.name}: ` + Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} ${n}`).join(', '))
        }
        const errs = store.jobs.papers(job).filter(p => p.status === 'error')
        if (errs.length) lines.push('Errors: ' + errs.slice(0, 5).map(p => `${p.paper_id}: ${p.error.slice(0, 120)}`).join('; '))
        lines.push('Sample rows (paper_id | item | field | value | page | check | quote):')
        for (const x of c.slice(0, 40)) lines.push(`${x.paper_id} | ${x.item} | ${x.field} | ${String(x.value).slice(0, 80)} | ${x.page ?? '-'} | ${x.quote_found ?? '-'} | ${x.quote.slice(0, 160)}`)
        lines.push('Query everything with sql on almanac.codings.')
        return text(lines.join('\n'))
      })),

    tool('cancel_job', 'Stop a running coding run. Papers already coded stay.', { job: z.string() },
      safe(async ({ job }) => text(jobs.cancelJob(job) ? `Stopping run ${job}.` : `No run ${job}.`))),

    tool('resume_job', 'Continue a paused, failed or stopped coding run from where it stopped.', { job: z.string() },
      safe(async ({ job }) => { jobs.resumeJob(job); return text(`Resumed run ${job}.`) })),
  ]
  return createSdkMcpServer({ name: 'almanac', version: '1.0.0', tools, alwaysLoad: true })
}
