import { NextResponse } from 'next/server';
import { COOKIE, COOKIE_MAX_AGE, checkPasscode, tokenFor } from '@/lib/openlab/auth';

export async function POST(req: Request) {
  const { passcode } = (await req.json().catch(() => ({}))) as { passcode?: string };
  if (typeof passcode !== 'string' || !checkPasscode(passcode)) {
    return new NextResponse('Wrong passcode.', { status: 401 });
  }
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(COOKIE, tokenFor(passcode.trim().toLowerCase()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
