// Playwright harness for verifying the Jam web app headlessly.
//
//   import { openStudio } from './pw-harness.mjs'
//   const { browser, page } = await openStudio({ trackTitle: 'SEQ TEST techno copy' })
//   ... drive the page ...
//   await browser.close()
//
// Uses the local `playwright` package (its own Chromium — safe to run several
// scripts at once). Signs in as the throwaway `jamtest` account and opens the
// named track. Never point this at Bart's account (`bart`): local dev writes
// to the production database.
//
// Env: JAM_URL (default http://localhost:3100), JAM_USER / JAM_PASS.

import { chromium, devices } from 'playwright'

export const PHONE = { width: 390, height: 844 }
export const PHONE_LANDSCAPE = { width: 844, height: 390 }

export async function launch({ viewport = PHONE, headless = true } = {}) {
  const browser = await chromium.launch({ headless })
  const context = await browser.newContext({
    ...devices['iPhone 14'],
    viewport,
    // Web Audio needs no real output device in headless Chromium, but a
    // user gesture is still required to unlock; tests click Play.
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  return { browser, context, page, errors }
}

export async function signIn(page, { user = process.env.JAM_USER || 'jamtest', pass = process.env.JAM_PASS || 'jamtest1' } = {}) {
  const base = process.env.JAM_URL || 'http://localhost:3100'
  await page.goto(`${base}/jam`, { waitUntil: 'networkidle' })
  // Already signed in? The library header has the Sign out key. (The
  // signed-out landing also has a "Make a new track" CTA, so that key is
  // not the tell.)
  const already = await page.getByRole('button', { name: /^sign out$/i }).count()
  if (already) return
  // The landing keeps the form closed for first-time visitors: open it.
  const username = page.getByPlaceholder(/username/i)
  if (!(await username.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /^sign in$/i }).first().click()
    await username.waitFor({ timeout: 5000 })
  }
  await username.fill(user)
  await page.getByPlaceholder(/password/i).fill(pass)
  await page.getByRole('button', { name: /^sign in$/i }).last().click()
  await page.getByRole('button', { name: /^sign out$/i }).waitFor({ timeout: 15000 })
}

/** Sign in and open a track by title; resolves once the groovebox is loaded. */
export async function openStudio({ trackTitle, viewport = PHONE, headless = true } = {}) {
  const h = await launch({ viewport, headless })
  await signIn(h.page)
  if (trackTitle) {
    await h.page.getByText(trackTitle, { exact: false }).first().click()
  } else {
    await h.page.getByRole('button', { name: /new track/i }).click()
  }
  await h.page.getByPlaceholder(/tell it what to play/i).waitFor({ timeout: 30000 })
  return h
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
