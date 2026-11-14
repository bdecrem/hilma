-- kochitolabs.com: the landing pages' counters and sign-ups (2026-11-14).
-- One row per thing a visitor does. No cookies: `sid` is a random id the page
-- keeps in localStorage, so a returning browser counts once per page.
create table if not exists kochito_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  page text not null,                 -- 'home' | 'pdf' | 'apps'
  kind text not null,                 -- 'view' | 'cta' (focused the form) | 'lead'
  sid text,
  src text not null default 'direct', -- utm_source
  campaign text,                      -- utm_campaign
  term text,                          -- utm_term (the ad keyword)
  ref text,                           -- document.referrer's host
  ua text,
  bot boolean not null default false
);
create index if not exists kochito_events_page_at on kochito_events (page, at);
alter table kochito_events enable row level security;

-- A sign-up: someone asked for the free fix or the free check.
create table if not exists kochito_leads (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  page text not null,
  email text not null,
  detail text,                        -- the PDF's link, or the app's store link
  note text,
  sid text,
  src text not null default 'direct',
  campaign text,
  term text,
  -- when the working session read it
  seen_at timestamptz
);
create index if not exists kochito_leads_unseen on kochito_leads (id) where seen_at is null;
alter table kochito_leads enable row level security;
