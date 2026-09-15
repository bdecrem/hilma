-- Socratic: modules drafted from the web form (POST /api/socratic/modules).
--
-- Apply:  supabase db query --linked -f apps/socratic/schema/002_soc_modules.sql   (applied 2026-09-15; scripts/db is SELECT-only)
--
-- File modules (src/lib/socratic/modules/*.ts) and these rows are merged by
-- the registry (modules/index.ts); a row holds the topic-specific draft, the
-- shared method and tone are added at load time. Service-role only.

create table if not exists soc_modules (
  id          text primary key,
  created_at  timestamptz not null default now(),
  topic       text not null,
  course      text not null default '',
  sources     jsonb not null default '[]',   -- names of the uploaded/pasted sources
  draft       jsonb not null,                -- the Draft (draft.ts)
  transcript  text not null default '',
  model       text,
  notes       text not null default ''
);

alter table soc_modules enable row level security;
