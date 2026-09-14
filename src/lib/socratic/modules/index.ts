import type { Module } from '../types'
import { negligentEntrustment } from './negligent-entrustment'

export const MODULES: Record<string, Module> = {
  [negligentEntrustment.id]: negligentEntrustment,
}

export const DEFAULT_MODULE = negligentEntrustment.id

export function getModule(id: string): Module | null {
  return MODULES[id] ?? null
}
