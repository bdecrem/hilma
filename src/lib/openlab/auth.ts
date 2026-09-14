import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';

export const COOKIE = 'openlab_pass';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // a year

function passcode() {
  const p = process.env.OPENLAB_PASSCODE;
  if (!p) throw new Error('OPENLAB_PASSCODE is not set');
  return p;
}

// The cookie holds a hash of the passcode, so changing the passcode in env
// signs everyone out.
export function tokenFor(code: string) {
  return createHash('sha256').update(`openlab:${code}`).digest('hex');
}

export function checkPasscode(code: string) {
  return code.trim().toLowerCase() === passcode().toLowerCase();
}

export async function isSignedIn() {
  const c = (await cookies()).get(COOKIE)?.value;
  return !!c && c === tokenFor(passcode());
}
