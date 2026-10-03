// A reader's own password, replacing the shared passcode once set.
// bcrypt hash in osai_users; no row means the shared passcode still applies.

import bcrypt from 'bcryptjs'
import { osaiDb } from './db'
import type { OsaiUser } from './auth'

export const PASSWORD_MIN = 8

export async function getPasswordHash(user: OsaiUser): Promise<string | null> {
  const { data, error } = await osaiDb().from('osai_users').select('password_hash').eq('user_name', user).maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.password_hash as string | undefined) ?? null
}

export async function hasPassword(user: OsaiUser): Promise<boolean> {
  try {
    return (await getPasswordHash(user)) !== null
  } catch {
    return false
  }
}

export function validatePassword(password: unknown, confirm: unknown): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return `At least ${PASSWORD_MIN} characters.`
  if (password !== confirm) return 'The two entries do not match.'
  return null
}

export async function setPassword(user: OsaiUser, password: string): Promise<void> {
  const password_hash = await bcrypt.hash(password, 10)
  const { error } = await osaiDb()
    .from('osai_users')
    .upsert({ user_name: user, password_hash, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

export async function clearPassword(user: OsaiUser): Promise<void> {
  const { error } = await osaiDb().from('osai_users').delete().eq('user_name', user)
  if (error) throw new Error(error.message)
}

export async function checkPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
