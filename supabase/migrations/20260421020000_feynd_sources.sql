-- Feynd source pool — per-topic curated reference library.
--
-- One row per source document (paper, blog post, tech report, news piece,
-- or video transcript imported from a course). The backend loads all rows
-- for a topic and injects them as cache-controlled system blocks on Opus
-- calls, so the tutor can answer detailed questions about how frontier
-- models actually work in 2025–2026.

create table if not exists feynd_sources (
  id              uuid primary key default gen_random_uuid(),
  topic_id        text not null,
  kind            text not null check (kind in ('video','article','paper','blog','tech_report','system_card','news','note')),
  url             text,
  title           text not null,
  author          text,
  publisher       text,
  published_on    date,
  fetched_at      timestamptz not null default now(),
  source_text     text not null,
  summary         text,
  tags            text[] not null default '{}',
  token_estimate  int,
  unique (topic_id, url)
);

create index if not exists idx_feynd_sources_topic on feynd_sources(topic_id, published_on desc);
create index if not exists idx_feynd_sources_tags  on feynd_sources using gin(tags);
