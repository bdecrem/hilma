-- kochitolabs.com/s/<slug>: one fixed document shown to its owner (2026-11-14).
-- The first email to a city links here: its own agenda, fixed, with the
-- checker's numbers before and after and what a screen reader now reads.
-- Rows are written by scripts/venture/kochito-sample.mjs; the fixed PDF sits in
-- the public storage bucket kochito-samples. A page shows only once `published`.
create table if not exists kochito_samples (
  slug text primary key,
  org text not null,                 -- "City of Killeen"
  title text not null,               -- "City Council agenda, November 17, 2026"
  pages int not null,
  original_url text not null,        -- where the owner posted it
  fixed_url text not null,           -- the fixed PDF in storage
  before jsonb not null,             -- veraPDF PDF/UA-1 on the original: failedChecks, failedRules, rules[]
  after jsonb not null,              -- the same on the fix
  transcript text not null,          -- the tag tree as a screen reader walks it (dump.py)
  published boolean not null default false,
  created_at timestamptz not null default now()
);
alter table kochito_samples enable row level security;
