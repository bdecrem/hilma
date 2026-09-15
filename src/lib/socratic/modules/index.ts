// The module registry: the modules checked in as TS files plus the ones
// drafted from the web form (soc_modules rows, given the shared method and
// tone at load time). Ids are unique across both; a file wins on a clash.

import { useClaudeCode } from '../claude-code'
import { moduleFromDraft } from '../draft'
import { getModuleRow, listModuleRows } from '../store'
import type { Module } from '../types'
import { negligentEntrustment } from './negligent-entrustment'
import { premisesLiability } from './premises-liability'
import { belgianRevolution } from './belgian-revolution'

export const FILE_MODULES: Record<string, Module> = {
  [negligentEntrustment.id]: negligentEntrustment,
  [premisesLiability.id]: premisesLiability,
  [belgianRevolution.id]: belgianRevolution,
}

export const DEFAULT_MODULE = negligentEntrustment.id

/**
 * The public deployment (Vercel, API credit) serves the one legal topic the
 * study is about; the local machine (Claude Code backend) serves every
 * module and the topic generator. SOC_ALL_MODULES=1 opens it up elsewhere.
 */
export function allModules(): boolean {
  return useClaudeCode() || process.env.SOC_ALL_MODULES === '1'
}

export async function getModule(id: string): Promise<Module | null> {
  if (!allModules()) return id === DEFAULT_MODULE ? FILE_MODULES[id] : null
  if (FILE_MODULES[id]) return FILE_MODULES[id]
  const row = await getModuleRow(id)
  return row ? moduleFromDraft(row.id, row.draft, row.transcript) : null
}

export async function listModules(): Promise<Module[]> {
  if (!allModules()) return [FILE_MODULES[DEFAULT_MODULE]]
  const rows = await listModuleRows()
  return [...Object.values(FILE_MODULES), ...rows.filter((r) => !FILE_MODULES[r.id]).map((r) => moduleFromDraft(r.id, r.draft, r.transcript))]
}

export type ModuleInfo = Pick<Module, 'id' | 'title' | 'subtitle' | 'course' | 'source'>

export function moduleInfo(m: Module): ModuleInfo {
  return { id: m.id, title: m.title, subtitle: m.subtitle, course: m.course, source: m.source }
}
