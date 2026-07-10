-- Omniglot core schema. Standalone from F2 — own users, own sessions cookie.
-- Apply with: supabase db query --linked -f apps/omniglot/schema/001_omni_core.sql

create table if not exists omni_users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  display_name text,
  language text not null default 'es',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists omni_users_email_lower_uniq
  on omni_users (lower(email));
alter table omni_users enable row level security;

-- Level + XP per (user, language) so switching languages keeps progress.
create table if not exists omni_progress (
  user_id uuid not null references omni_users(id) on delete cascade,
  language text not null,
  level int not null default 1 check (level between 1 and 6),
  xp int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, language)
);
alter table omni_progress enable row level security;

-- Chapters. Prebaked rows have user_id null; custom/freeform belong to a user.
create table if not exists omni_topics (
  id uuid primary key default gen_random_uuid(),
  language text not null,
  level int not null check (level between 1 and 6),
  kind text not null check (kind in ('prebaked', 'custom', 'freeform')),
  user_id uuid references omni_users(id) on delete cascade,
  title text not null,
  title_target text,
  emoji text,
  description text,
  dialogue jsonb not null default '[]'::jsonb,
  grammar jsonb,
  status text not null default 'ready' check (status in ('generating', 'ready', 'failed')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists omni_topics_prebaked_idx
  on omni_topics (language, level, sort_order) where user_id is null;
create index if not exists omni_topics_user_idx
  on omni_topics (user_id, created_at desc) where user_id is not null;
alter table omni_topics enable row level security;

create table if not exists omni_cards (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references omni_topics(id) on delete cascade,
  term text not null,
  romanization text,
  meaning text not null,
  example text,
  example_translation text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists omni_cards_topic_idx on omni_cards (topic_id, sort_order);
alter table omni_cards enable row level security;

-- Per-user flash-card state. strength 0-5; known reviews climb, misses drop.
create table if not exists omni_reviews (
  user_id uuid not null references omni_users(id) on delete cascade,
  card_id uuid not null references omni_cards(id) on delete cascade,
  strength int not null default 0 check (strength between 0 and 5),
  review_count int not null default 0,
  last_result text check (last_result in ('known', 'unknown')),
  last_reviewed_at timestamptz,
  primary key (user_id, card_id)
);
alter table omni_reviews enable row level security;

create table if not exists omni_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references omni_users(id) on delete cascade,
  topic_id uuid references omni_topics(id) on delete set null,
  mode text not null check (mode in ('chapter', 'freeform')),
  language text not null,
  level int not null,
  realtime_session_id text,
  realtime_model text,
  realtime_voice text,
  transcript jsonb not null default '[]'::jsonb,
  corrections jsonb not null default '[]'::jsonb,
  summary text,
  xp_awarded int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists omni_conversations_user_idx
  on omni_conversations (user_id, created_at desc);
alter table omni_conversations enable row level security;
