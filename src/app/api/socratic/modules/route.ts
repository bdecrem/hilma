// POST /api/socratic/modules — draft a new topic module and store it.
//
// multipart/form-data: topic (what to teach + the open question), course
// (optional), sourceText (pasted material, optional), files (.txt/.md/.docx,
// optional, repeatable), key (the researcher key, unless the server runs on
// the local Claude Code backend, where creation is open).
//
// One model call of about four minutes, then a soc_modules row. Returns the
// module header and the draft's reviewer notes.

import { NextRequest, NextResponse } from 'next/server'
import { useClaudeCode } from '@/lib/socratic/claude-code'
import { draftModule, slugify, sourceText, type SourceText } from '@/lib/socratic/draft'
import { FILE_MODULES, getModule, moduleInfo } from '@/lib/socratic/modules'
import { getModuleRow, insertModuleRow } from '@/lib/socratic/store'
import { authorized } from '@/app/socratic/sessions/auth'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_SOURCE_CHARS = 400_000

function canCreate(key: string | undefined): boolean {
  return useClaudeCode() || authorized(key)
}

const err = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return err('expected multipart form data', 400)
  }
  const key = form.get('key')
  if (!canCreate(typeof key === 'string' ? key : undefined)) return err('Creating topics needs the researcher key.', 403)

  const topic = String(form.get('topic') ?? '').trim()
  const course = String(form.get('course') ?? '').trim()
  if (topic.length < 20) return err('Describe the topic in at least a sentence: the rule or case, and the open question to argue.', 400)
  if (topic.length > 4000) return err('Keep the topic under 4000 characters; put the material in the sources.', 400)

  const sources: SourceText[] = []
  const pasted = String(form.get('sourceText') ?? '').trim()
  if (pasted) sources.push({ name: 'pasted text', text: pasted })
  for (const f of form.getAll('files')) {
    if (!(f instanceof File) || !f.size) continue
    try {
      sources.push({ name: f.name, text: sourceText(f.name, Buffer.from(await f.arrayBuffer())) })
    } catch (e) {
      return err((e as Error).message, 400)
    }
  }
  const total = sources.reduce((n, s) => n + s.text.length, 0)
  if (total > MAX_SOURCE_CHARS) return err(`Sources total ${total.toLocaleString()} characters; keep them under ${MAX_SOURCE_CHARS.toLocaleString()}.`, 400)

  try {
    const r = await draftModule(topic, course, sources, '', (l) => console.log('[socratic/modules]', l))
    let id = slugify(r.draft.title)
    for (let n = 2; FILE_MODULES[id] || (await getModuleRow(id)); n++) id = `${slugify(r.draft.title).slice(0, 44)}-${n}`
    await insertModuleRow({
      id,
      topic,
      course,
      sources: sources.map((s) => s.name),
      draft: r.draft,
      transcript: '',
      model: r.model,
      notes: r.draft.notes,
    })
    const m = (await getModule(id))!
    console.log(`[socratic/modules] drafted ${id} in ${(r.latencyMs / 1000).toFixed(0)} s`)
    return NextResponse.json({ module: moduleInfo(m), notes: r.draft.notes, model: r.model, latencyMs: r.latencyMs })
  } catch (e) {
    console.error('[socratic/modules]', (e as Error).message)
    return err('The draft failed. Nothing was saved — try again.', 502)
  }
}
