-- Polly baseline (2026-09-17).
--
-- A consolidated copy of Dodo's F2 schema as of apps/f2/schema/048, renamed
-- f2_* -> polly_*. Structure only: no backfills, no seed users, no Loci (f3_*)
-- tables. This is the starting point the language reshape (courses, ordered
-- chapters, language-shaped cards) is built on — see docs/polly-plan.md.
--
-- Storage: Polly reuses Dodo's public buckets (f2-avatars, f2-audio,
-- f2-pebbles). Objects are keyed by user id, and Polly users are their own
-- rows, so paths never collide.
--
-- RLS on, no policies = service-key access only (same as F2).
-- Apply with: supabase db query --linked -f apps/polly/schema/001_polly_baseline.sql

-- Users ----------------------------------------------------------------------

create table if not exists polly_users (
  id                 uuid primary key default gen_random_uuid(),
  username           text not null unique,
  password_hash      text not null,
  email              text,
  avatar_url         text,
  is_guest           boolean not null default false,
  imessage_handles   text[] not null default '{}',
  pending_quote      text,
  xp                 integer not null default 0,
  realtime_voice     text,
  voice_style        text,
  daily_card         jsonb,
  daily_card_enabled boolean not null default false,
  daily_chat_guid    text,
  daily_streak       integer not null default 0,
  daily_streak_date  date,
  peck_credit        jsonb,
  peck_week_start    date,
  recert_enabled     boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table polly_users enable row level security;

create unique index if not exists polly_users_email_lower_uniq
  on polly_users (lower(email)) where email is not null;
create index if not exists polly_users_imessage_handles_gin
  on polly_users using gin (imessage_handles);

-- Threads (Dodo's topics; become chapters in the language reshape) ------------

create table if not exists polly_threads (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references polly_users(id) on delete cascade,
  handle                 text not null,
  client                 text not null default 'sms',
  url                    text,
  topic                  text,
  content                text,
  messages               jsonb not null default '[]'::jsonb,
  kind                   text not null default 'fallback',
  additional_sources     jsonb not null default '[]'::jsonb,
  quotes                 jsonb not null default '[]'::jsonb,
  primer                 jsonb,
  study_focus            text,
  video_band             text,
  audio_summary          jsonb,
  book_summary           jsonb,
  last_quizzed_at        timestamptz,
  quiz_count             integer not null default 0,
  stars                  smallint not null default 0,
  hard_quiz_completed_at timestamptz,
  pending_quiz_kind      text,
  recert_stage           int not null default 0,
  recert_due_at          timestamptz,
  pinned_at              timestamptz,
  peck_excluded          boolean not null default false,
  peck_weight            real not null default 1,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint polly_threads_stars_range check (stars between 0 and 3),
  constraint polly_threads_pending_quiz_kind_check
    check (pending_quiz_kind is null or pending_quiz_kind in ('standard', 'hard', 'reflection')),
  constraint polly_threads_kind_check
    check (kind in ('chat', 'web', 'audio', 'video', 'paste', 'fallback', 'book', 'mini', 'general'))
);
alter table polly_threads enable row level security;

create index if not exists polly_threads_client_handle_updated_idx
  on polly_threads (client, handle, updated_at desc);
create index if not exists polly_threads_user_updated_idx
  on polly_threads (user_id, updated_at desc);
create index if not exists polly_threads_user_stars_idx
  on polly_threads (user_id) where stars > 0;

-- Flash cards + sets -----------------------------------------------------------

create table if not exists polly_flash_cards (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references polly_users(id) on delete cascade,
  thread_id      uuid not null references polly_threads(id) on delete cascade,
  question       text not null,
  answer         text not null,
  open_question  text,
  distractors    jsonb not null default '[]'::jsonb,
  cloze_text     text,
  cloze_answer   text,
  grading_note   text,
  rating         text,
  rated_at       timestamptz,
  times_shown    integer not null default 0,
  last_shown_at  timestamptz,
  reps           integer not null default 0,
  lapses         integer not null default 0,
  ease           numeric(4,2) not null default 2.5,
  interval_days  numeric(8,2) not null default 0,
  scheduled_days numeric(8,2) not null default 0,
  due_at         timestamptz,
  streak         integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint polly_flash_cards_rating_check
    check (rating is null or rating in ('down', 'down1', 'priority'))
);
alter table polly_flash_cards enable row level security;

create index if not exists polly_flash_cards_thread_idx
  on polly_flash_cards (thread_id, created_at);
create index if not exists polly_flash_cards_user_idx
  on polly_flash_cards (user_id);
create index if not exists polly_flash_cards_due_idx
  on polly_flash_cards (user_id, due_at) where rating is distinct from 'down';
create index if not exists polly_flash_cards_rating_idx
  on polly_flash_cards (user_id, rating) where rating is not null;

create table if not exists polly_flash_sets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references polly_users(id) on delete cascade,
  thread_id   uuid references polly_threads(id) on delete cascade,
  jumbo_level integer,
  mode        text not null,
  score       integer not null,
  total       integer not null,
  results     jsonb not null default '[]'::jsonb,
  xp          integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint polly_flash_sets_scope check (
    (thread_id is not null and jumbo_level is null)
    or (thread_id is null and jumbo_level is not null)
  ),
  constraint polly_flash_sets_mode_check
    check (mode in ('choice', 'text', 'voice', 'mixed'))
);
alter table polly_flash_sets enable row level security;

create index if not exists polly_flash_sets_thread_idx
  on polly_flash_sets (thread_id, created_at desc) where thread_id is not null;
create index if not exists polly_flash_sets_jumbo_idx
  on polly_flash_sets (user_id, jumbo_level) where jumbo_level is not null;
create index if not exists polly_flash_sets_user_idx
  on polly_flash_sets (user_id, created_at desc);

-- Voice sessions -----------------------------------------------------------------

create table if not exists polly_voice_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references polly_users(id) on delete cascade,
  thread_id           uuid references polly_threads(id) on delete set null,
  mode                text not null,
  realtime_session_id text,
  realtime_model      text,
  realtime_voice      text,
  started_at          timestamptz not null default now(),
  ended_at            timestamptz,
  transcript          jsonb not null default '[]'::jsonb,
  summary             text,
  usage               jsonb not null default '{}'::jsonb,
  grade               text,
  graded_at           timestamptz,
  grade_detail        jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint polly_voice_sessions_mode_check
    check (mode in ('global', 'topic', 'flash', 'final_review', 'second_chance', 'recert'))
);
alter table polly_voice_sessions enable row level security;

create index if not exists polly_voice_sessions_user_started_idx
  on polly_voice_sessions (user_id, started_at desc);
create index if not exists polly_voice_sessions_thread_started_idx
  on polly_voice_sessions (thread_id, started_at desc) where thread_id is not null;

-- Artifacts (pebbles) and community -----------------------------------------------

create table if not exists polly_artifacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references polly_users(id) on delete cascade,
  thread_id  uuid references polly_threads(id) on delete set null,
  kind       text not null default 'quote',
  body       text not null default '',
  source     text,
  image_url  text,
  created_at timestamptz not null default now()
);
alter table polly_artifacts enable row level security;
create index if not exists polly_artifacts_user_created_idx
  on polly_artifacts (user_id, created_at desc);

create table if not exists polly_community_topics (
  id        uuid primary key default gen_random_uuid(),
  thread_id uuid not null unique references polly_threads(id) on delete cascade,
  user_id   uuid not null references polly_users(id) on delete cascade,
  shared_at timestamptz not null default now()
);
alter table polly_community_topics enable row level security;
create index if not exists polly_community_topics_shared_idx
  on polly_community_topics (shared_at desc);

-- iMessage -------------------------------------------------------------------------

create table if not exists polly_imessage_pending (
  user_id    uuid not null references polly_users(id) on delete cascade,
  handle     text not null,
  code       text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, handle)
);
alter table polly_imessage_pending enable row level security;
create index if not exists polly_imessage_pending_expires_idx
  on polly_imessage_pending (expires_at);

create table if not exists polly_imessage_outbound (
  id        bigint generated always as identity primary key,
  chat_guid text,
  text      text not null,
  sent_at   timestamptz not null default now()
);
alter table polly_imessage_outbound enable row level security;
create index if not exists polly_imessage_outbound_sent_idx
  on polly_imessage_outbound (sent_at desc);

create table if not exists polly_processed_webhooks (
  guid       text primary key,
  client     text not null,
  created_at timestamptz not null default now()
);
alter table polly_processed_webhooks enable row level security;
create index if not exists polly_processed_webhooks_created_idx
  on polly_processed_webhooks (created_at desc);

-- Functions ------------------------------------------------------------------------

create or replace function polly_mark_cards_shown(
  p_user_id uuid,
  p_card_ids uuid[],
  p_now timestamptz
) returns void
language sql
security definer
set search_path = public
as $$
  update polly_flash_cards
     set times_shown   = times_shown + 1,
         last_shown_at = p_now
   where user_id = p_user_id
     and id = any(p_card_ids);
$$;

create or replace function polly_add_xp(p_user_id uuid, p_amount int)
returns int
language sql
as $$
  update polly_users
  set xp = coalesce(xp, 0) + p_amount,
      updated_at = now()
  where id = p_user_id
  returning xp;
$$;
