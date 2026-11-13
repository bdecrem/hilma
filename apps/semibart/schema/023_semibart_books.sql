-- CASBS Quest books (2026-11-13). Every fellow's book is written ahead of time, one per
-- character: a funny, unexpected piece in whatever form suits them (a play, a poem, a picture
-- book of nothing but drawings), ten pages. A fellow reads it a page at a time as they pick up
-- loose leaves (semibart_pages); at ten it is unlocked: anyone can read it, and its owner can ask
-- the chat to change it. Admins read every book at any time. Server: src/lib/semibart/books.ts.
-- Apply: supabase db query --linked -f apps/semibart/schema/023_semibart_books.sql
create table if not exists semibart_books (
  character text primary key,                 -- the game's slug: 'mary'
  form text not null,                         -- 'a Western', 'terms and conditions'
  title text not null,
  subtitle text not null default '',
  pages jsonb not null,                       -- ten of { text, art: { rows, palette } | null }
  about text not null default '',             -- the line the book was written from (FELLOWS[k].look)
  version int not null default 1,
  updated_at timestamptz not null default now()
);
-- every version, so a change can be undone and a bad generation compared with a good one
create table if not exists semibart_book_versions (
  id bigint generated always as identity primary key,
  character text not null,
  version int not null,
  book jsonb not null,                        -- { form, title, subtitle, pages }
  ask text not null default '',               -- '' for the first draft, else what the owner asked
  author text not null default '',            -- who asked: a semibart_users id, or 'generator'
  created_at timestamptz not null default now(),
  unique (character, version)
);
alter table semibart_books enable row level security;
alter table semibart_book_versions enable row level security;
