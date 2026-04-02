import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

let _supabase: SupabaseClient | null = null
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    )
  }
  return _supabase
}

export async function POST(req: Request) {
  const body = await req.json()

  const { app_name, app_url, description, audience, channels, timeline } = body

  if (!app_name || !description || !audience) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data, error } = await getSupabase()
    .from('first100_briefs')
    .insert({
      app_name,
      app_url: app_url || null,
      description,
      audience,
      channels: channels || [],
      timeline: timeline || '1m',
    })
    .select()
    .single()

  if (error) {
    console.error('[first100] insert error:', error)
    return NextResponse.json({ error: 'Failed to save brief' }, { status: 500 })
  }

  return NextResponse.json({ brief: data })
}
