-- F2: durable voice session records for OpenAI Realtime conversations.
-- Raw voice transcripts live here; f2_threads.messages should only receive
-- compact summaries so text-chat context remains useful.

create table if not exists f2_voice_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references f2_users(id) on delete cascade,
  thread_id        uuid references f2_threads(id) on delete set null,
  mode             text not null check (mode in ('global', 'topic')),
  realtime_session_id text,
  realtime_model   text,
  realtime_voice   text,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  transcript       jsonb not null default '[]'::jsonb,
  summary          text,
  usage            jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table f2_voice_sessions enable row level security;

create index if not exists f2_voice_sessions_user_started_idx
  on f2_voice_sessions (user_id, started_at desc);

create index if not exists f2_voice_sessions_thread_started_idx
  on f2_voice_sessions (thread_id, started_at desc)
  where thread_id is not null;
