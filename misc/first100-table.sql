-- Create first100_briefs table
create table if not exists first100_briefs (
  id uuid primary key default gen_random_uuid(),
  app_name text not null,
  app_url text,
  description text not null,
  audience text not null,
  channels text[] not null default '{}',
  timeline text not null default '1m',
  status text not null default 'new',
  plan jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table first100_briefs enable row level security;

-- Allow inserts from anon (the form) and full access from service key
create policy "Anyone can submit a brief"
  on first100_briefs for insert
  to anon
  with check (true);

create policy "Service role full access"
  on first100_briefs for all
  to service_role
  using (true)
  with check (true);
