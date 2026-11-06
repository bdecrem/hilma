-- English machine translations for the law library (ola.cx/mrd).
-- translations: the reader's "English" switch translates a page on demand in ~5k-char chunks; each chunk is paid for once.
-- article_translations: every cited article of a non-English law, translated ahead of time (scripts/mrd/translate-articles.ts).
create table if not exists translations (
  law_id uuid not null references laws(id) on delete cascade,
  page int not null,
  chunk int not null,
  src_hash text not null,          -- sha1 of the source chunk; a re-crawled text invalidates it
  text text not null,
  model text not null,
  created_at timestamptz not null default now(),
  primary key (law_id, page, chunk)
);
create table if not exists article_translations (
  law_id uuid not null references laws(id) on delete cascade,
  article text not null,           -- as articleNumbers() gives it: "29", "L223-2"
  source text not null,
  english text not null,
  model text not null,
  created_at timestamptz not null default now(),
  primary key (law_id, article)
);
alter table translations enable row level security;
alter table article_translations enable row level security;
