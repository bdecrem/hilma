-- F2: the knowledge layer behind Dodo's GLOBAL chat (text + voice) — one
-- conversation that knows everything in all of ONE user's topics
-- (src/lib/f2/knowledge.ts). Two layers:
--   1. f2_topic_digests — a short "wiki card" per topic, written by an LLM when
--      the material changes. Every digest of the user goes into the global
--      prompt, so Dodo always has the map.
--   2. f2_topic_chunks — the material itself, chunked and embedded, searched
--      per turn (vector + full text) for the passages a question needs.
-- Both are keyed by user_id and every read filters on it: a user's universe is
-- their own topics, never anyone else's.

create extension if not exists vector;

create table if not exists f2_topic_digests (
  thread_id     uuid primary key references f2_threads(id) on delete cascade,
  user_id       uuid not null references f2_users(id) on delete cascade,
  digest        text not null,
  -- sha256 of the material the digest + chunks were built from; an unchanged
  -- hash means there is nothing to redo.
  content_hash  text not null,
  content_chars integer not null default 0,
  chunk_count   integer not null default 0,
  model         text,
  updated_at    timestamptz not null default now()
);

alter table f2_topic_digests enable row level security;

create index if not exists f2_topic_digests_user_idx on f2_topic_digests (user_id);

create table if not exists f2_topic_chunks (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references f2_threads(id) on delete cascade,
  user_id    uuid not null references f2_users(id) on delete cascade,
  idx        integer not null,
  text       text not null,
  embedding  vector(1536) not null,
  tsv        tsvector generated always as (to_tsvector('english', text)) stored,
  created_at timestamptz not null default now(),
  unique (thread_id, idx)
);

alter table f2_topic_chunks enable row level security;

create index if not exists f2_topic_chunks_user_idx on f2_topic_chunks (user_id);
create index if not exists f2_topic_chunks_tsv_idx on f2_topic_chunks using gin (tsv);
create index if not exists f2_topic_chunks_embedding_idx
  on f2_topic_chunks using hnsw (embedding vector_cosine_ops);

-- Hybrid search inside ONE user's chunks: the best vector matches and the best
-- full-text matches, fused by reciprocal rank. p_thread narrows to one topic.
-- A vector match must clear p_min_sim (cosine similarity): nearest-neighbour
-- search always returns SOMETHING, and "how do I bake bread" against a library
-- about the French Revolution must return nothing. Measured 2026-09-20 with
-- text-embedding-3-small: on-topic questions score 0.27–0.55 against their
-- passage, unrelated ones 0.07–0.16.
create or replace function f2_search_chunks(
  p_user      uuid,
  p_embedding vector(1536),
  p_query     text,
  p_limit     integer default 8,
  p_thread    uuid default null,
  p_min_sim   double precision default 0.22
)
returns table (chunk_id uuid, thread_id uuid, idx integer, content text, score double precision, similarity double precision)
language sql stable
as $$
  with vec as (
    select c.id, row_number() over (order by c.embedding <=> p_embedding) as rnk
    from f2_topic_chunks c
    where c.user_id = p_user and (p_thread is null or c.thread_id = p_thread)
      and (c.embedding <=> p_embedding) < 1 - p_min_sim
    order by c.embedding <=> p_embedding
    limit 40
  ),
  fts as (
    select c.id,
           row_number() over (order by ts_rank_cd(c.tsv, websearch_to_tsquery('english', p_query)) desc) as rnk
    from f2_topic_chunks c
    where c.user_id = p_user and (p_thread is null or c.thread_id = p_thread)
      and c.tsv @@ websearch_to_tsquery('english', p_query)
    order by ts_rank_cd(c.tsv, websearch_to_tsquery('english', p_query)) desc
    limit 40
  ),
  fused as (
    select id, sum(1.0 / (60 + rnk)) as score
    from (select id, rnk from vec union all select id, rnk from fts) r
    group by id
  )
  select c.id, c.thread_id, c.idx, c.text, f.score, 1 - (c.embedding <=> p_embedding)
  from fused f
  join f2_topic_chunks c on c.id = f.id
  order by f.score desc
  limit p_limit
$$;
