import { revalidateTag } from 'next/cache'

// Drop the library's cached database reads (tag 'mrd') after the data is changed by hand or by a script.
//   curl -X POST https://ola.cx/api/mrd/revalidate -H "Authorization: Bearer $MRD_SUPABASE_SERVICE_KEY"
export async function POST(req: Request) {
  const key = process.env.MRD_SUPABASE_SERVICE_KEY
  if (!key || req.headers.get('authorization') !== `Bearer ${key}`) return Response.json({ error: 'unauthorized' }, { status: 401 })
  revalidateTag('mrd')
  return Response.json({ ok: true })
}
