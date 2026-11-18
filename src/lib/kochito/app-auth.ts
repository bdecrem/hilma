// app.kochitolabs.com: Kit's page for Bart, behind a login (2026-11-14; before
// that it was kochitolabs.com/kit?k=<key>). A name and a passcode, then a
// signed cookie that lasts a year.
//
// This repo is public, so the accounts are not in it: KOCHITO_APP_USERS is
// "name:passcode,name:passcode" and KOCHITO_APP_SECRET signs the cookie, both
// in .env.local and on Vercel. Missing either one is an error, not a default.
//
// The passcodes are short. Wrong tries are stored (schema 007) and capped: an
// address gets 5 in an hour, everyone together 30 in a day. Clear a lockout
// with `node scripts/venture/app-check.mjs --unlock`.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { f2Supabase } from '@/lib/f2/supabase'

export const APP_HOST = 'app.kochitolabs.com'
export const APP_COOKIE = 'kl_app'
const YEAR = 365 * 24 * 3600
const PER_ADDRESS_AN_HOUR = 5
const EVERYONE_A_DAY = 30

function need(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

function users(): Map<string, string> {
  const out = new Map<string, string>()
  for (const pair of need('KOCHITO_APP_USERS').split(',')) {
    const i = pair.indexOf(':')
    if (i > 0) out.set(pair.slice(0, i).trim().toLowerCase(), pair.slice(i + 1).trim())
  }
  if (!out.size) throw new Error('KOCHITO_APP_USERS has no accounts')
  return out
}

// Is this name one of the site's accounts? (An admin's Ola sign-in may stand in for the passcode:
// src/app/api/kochito/app-token/route.ts.)
export const isAppUser = (name: string): boolean => /^[a-z0-9_-]{1,40}$/.test(name) && users().has(name)

const same = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
const sign = (payload: string) => createHmac('sha256', need('KOCHITO_APP_SECRET')).update(payload).digest('base64url')

export function sessionValue(user: string): { value: string; maxAge: number } {
  const payload = `${user}.${Math.floor(Date.now() / 1000) + YEAR}`
  return { value: `${payload}.${sign(payload)}`, maxAge: YEAR }
}

// The signed-in name, or null. An account removed from the list is signed out.
export function readSession(value: string | undefined): string | null {
  const m = value?.match(/^([a-z0-9_-]{1,40})\.(\d{9,11})\.([A-Za-z0-9_-]{43})$/)
  if (!m) return null
  if (!same(sign(`${m[1]}.${m[2]}`), m[3])) return null
  if (Number(m[2]) < Date.now() / 1000) return null
  return users().has(m[1]) ? m[1] : null
}

// The phone app's admin sign-in (Bart's Ola iPhone app, 2026-11-17): the same accounts and the
// same wrong-try limits as the page, but a token instead of a cookie. It is signed with a
// different label, so a cookie is not a token and a token is not a cookie. 30 days.
const APP_TOKEN_DAYS = 30
const tokenSign = (payload: string) => createHmac('sha256', need('KOCHITO_APP_SECRET')).update(`app-token:${payload}`).digest('base64url')

export function appToken(user: string, now = Date.now()): { token: string; expires: number } {
  const expires = Math.floor(now / 1000) + APP_TOKEN_DAYS * 24 * 3600
  const payload = `${user}.${expires}`
  return { token: `olaapp.${payload}.${tokenSign(payload)}`, expires }
}

// The account a token names, or null (bad, expired, or the account was removed).
export function readAppToken(value: string | null | undefined, now = Date.now()): string | null {
  const m = value?.match(/^olaapp\.([a-z0-9_-]{1,40})\.(\d{9,11})\.([A-Za-z0-9_-]{43})$/)
  if (!m) return null
  if (!same(tokenSign(`${m[1]}.${m[2]}`), m[3])) return null
  if (Number(m[2]) < now / 1000) return null
  return users().has(m[1]) ? m[1] : null
}

export async function sessionUser(): Promise<string | null> {
  return readSession((await cookies()).get(APP_COOKIE)?.value)
}

export type LoginResult = { ok: true; user: string } | { ok: false; status: 401 | 429; error: string }

export async function login(nameIn: unknown, passIn: unknown, ip: string): Promise<LoginResult> {
  const name = typeof nameIn === 'string' ? nameIn.trim().toLowerCase().slice(0, 40) : ''
  const pass = typeof passIn === 'string' ? passIn.trim().slice(0, 200) : ''
  const db = f2Supabase()
  const fails = async (since: number, byIp: boolean) => {
    let q = db.from('kochito_logins').select('id', { count: 'exact', head: true }).eq('ok', false).gte('at', new Date(Date.now() - since).toISOString())
    if (byIp) q = q.eq('ip', ip)
    const { count, error } = await q
    if (error) throw new Error(`kochito logins: ${error.message}`)
    return count ?? 0
  }
  if ((await fails(3600e3, true)) >= PER_ADDRESS_AN_HOUR) return { ok: false, status: 429, error: 'Too many wrong tries. Try again in an hour.' }
  if ((await fails(24 * 3600e3, false)) >= EVERYONE_A_DAY) return { ok: false, status: 429, error: 'Sign-in is closed for today after too many wrong tries.' }
  const expected = users().get(name)
  // compare against something either way, so a wrong name takes as long as a wrong passcode
  const ok = same(pass, expected ?? '\u0000no such account') && expected !== undefined
  const { error } = await db.from('kochito_logins').insert({ ip, username: name || null, ok })
  if (error) throw new Error(`kochito logins: ${error.message}`)
  return ok ? { ok: true, user: name } : { ok: false, status: 401, error: 'That name and passcode do not match.' }
}
