// What people type into the sign-in form → E.164, or a refusal. The iPhone
// phone keypad hides "+", so numbers outside the US arrive without it
// (2026-09-19: a +44 number could not sign in at all).
//   npx tsx scripts/onething/phone-check.ts
import { normalizeHandle, normalizePhone } from '../../src/lib/onething/core'

let failures = 0
const is = (raw: string, want: string | null) => {
  const got = normalizePhone(raw)
  const ok = got === want
  console.log(`${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(raw)} → ${got}${ok ? '' : ` (want ${want})`}`)
  if (!ok) failures++
}

// US, as before
is('6505550123', '+16505550123')
is('(650) 555-0123', '+16505550123')
is('1 650 555 0123', '+16505550123')
is('+1 650 555 0123', '+16505550123')
is('(555) 555-0101', '+15555550101') // the demo account

// UK, every way it gets typed
is('+44 7911 123456', '+447911123456')
is('+447911123456', '+447911123456')
is('44 7911 123456', '+447911123456')
is('447911123456', '+447911123456')
is('0044 7911 123456', '+447911123456')
is('+44 (0)7911 123456', '+447911123456')
is('+44 (0) 7911 123456', '+447911123456')

// Belgium (11 digits with the country code, never a US number)
is('+32 475 12 34 56', '+32475123456')
is('32475123456', '+32475123456')
is('0032 475 12 34 56', '+32475123456')

// national format: no country to go on → refused, the form asks for the code
is('07911 123456', null)
is('0475 12 34 56', null) // ten digits, was read as +1 before
is('+0 7911 123456', null)

// not a number
is('', null)
is('275591', null) // a sign-in code typed into the phone field
is('12345678901234567', null)

// handles from iMessage are untouched
const h = (raw: string, want: string | null) => {
  const got = normalizeHandle(raw)
  const ok = got === want
  console.log(`${ok ? 'PASS' : 'FAIL'} handle ${JSON.stringify(raw)} → ${got}`)
  if (!ok) failures++
}
h('+447911123456', '+447911123456')
h('+16505550123', '+16505550123')
h('Someone@iCloud.com', 'someone@icloud.com')

if (failures) { console.error(`\n${failures} failed`); process.exit(1) }
console.log('\nall passed')
