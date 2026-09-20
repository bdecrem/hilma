-- F2: Dodo's GLOBAL chat — one ongoing conversation per user that spans all of
-- their topics (src/lib/f2/global-chat.ts). Typed and spoken turns live in the
-- same list: a global voice session's transcript is appended here when it
-- ends (`via: 'voice'`). "New conversation" empties the list.
--
-- messages: [{ role: 'user'|'assistant', text, created_at, via?: 'voice',
--              sources?: [{ thread_id, topic }] }]
create table if not exists f2_global_chats (
  user_id    uuid primary key references f2_users(id) on delete cascade,
  messages   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table f2_global_chats enable row level security;
