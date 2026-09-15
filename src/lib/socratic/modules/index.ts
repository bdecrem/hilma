import type { Module } from '../types'
import { negligentEntrustment } from './negligent-entrustment'
import { premisesLiability } from './premises-liability'

export const MODULES: Record<string, Module> = {
  [negligentEntrustment.id]: negligentEntrustment,
  [premisesLiability.id]: premisesLiability,
}

export const DEFAULT_MODULE = negligentEntrustment.id

export function getModule(id: string): Module | null {
  return MODULES[id] ?? null
}
