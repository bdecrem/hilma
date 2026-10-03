-- osai — the Open Source AI site at /osai (2026-10-03).
-- Three fixed readers (mitchell, songyee, bart) behind one shared passcode;
-- each keeps a chat history with the notes-grounded assistant and a short
-- memory note the assistant maintains about them. RLS on, no policies: the
-- service-role client in src/lib/osai/db.ts is the only reader.

create table if not exists osai_messages (
  id bigserial primary key,
  user_name text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists osai_messages_user_idx on osai_messages (user_name, created_at);

create table if not exists osai_memory (
  user_name text primary key,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

alter table osai_messages enable row level security;
alter table osai_memory enable row level security;
