-- Experimental dossiers: six new countries coded by Claude (apps/mrd/dossiers), kept apart from
-- the MRD's human-coded data by an `experimental` flag on every row they produce.

alter table countries
  add column if not exists experimental boolean not null default false,
  add column if not exists description_en text,
  add column if not exists description_es text,
  add column if not exists description_fr text,
  add column if not exists coded_at timestamptz,
  add column if not exists coded_by text;            -- e.g. 'claude-opus-5-5'
alter table citations add column if not exists experimental boolean not null default false;
alter table laws add column if not exists experimental boolean not null default false;

-- rows written for an experimental country carry the flag whatever script wrote them
create or replace function mark_experimental() returns trigger language plpgsql as $$
begin
  new.experimental := coalesce((select experimental from countries where id = new.country_id), false) or new.experimental;
  return new;
end $$;
drop trigger if exists citations_experimental on citations;
create trigger citations_experimental before insert or update of country_id on citations for each row execute function mark_experimental();
drop trigger if exists laws_experimental on laws;
create trigger laws_experimental before insert or update of country_id on laws for each row execute function mark_experimental();

-- the six. ids from 1001 so they never collide with MRD ids; ISO codes are real ISO 3166-1 alpha-3
insert into countries (id, iso, slug, name_en, experimental) values
  (1001, 'PRT', 'portugal', 'Portugal', true),
  (1002, 'NOR', 'norway', 'Norway', true),
  (1003, 'PHL', 'philippines', 'Philippines', true),
  (1004, 'CRI', 'costa_rica', 'Costa Rica', true),
  (1005, 'QAT', 'qatar', 'Qatar', true),
  (1006, 'CHN', 'china', 'China', true)
on conflict (id) do nothing;

-- the country-level answers behind the scores (the MRD's 10,000 for 2020/2023, and ours)
create table if not exists answers (
  id bigserial primary key,
  country_id int not null references countries(id),
  year int not null,
  question_id int not null references questions(id),
  answer text,                   -- the coder's words / the option picked
  subscore numeric,              -- null = no score (No, Does Not Apply)
  evidence text,                 -- experimental: why this implementation level
  sources jsonb,                 -- experimental: [{title,url,year,quote}]
  confidence text,               -- experimental: high | medium | low
  notes text,
  experimental boolean not null default false,
  created_at timestamptz not null default now(),
  unique (country_id, year, question_id)
);
create index if not exists answers_country on answers (country_id, year);

create table if not exists scores (
  country_id int not null references countries(id),
  year int not null,
  category_id int not null references categories(id),
  score_type text not null,      -- Protection | Implementation | Adjusted
  score numeric,
  experimental boolean not null default false,
  primary key (country_id, year, category_id, score_type)
);

-- progress of the compiler, per country and per chunk of indicators
create table if not exists dossier_runs (
  country_id int primary key references countries(id),
  status text not null default 'queued',   -- preparing | queued | mapping | coding | scoring | laws | done | error
  chunks_done int not null default 0,
  chunks_total int not null default 0,
  questions_done int not null default 0,
  questions_total int not null default 68,
  calls int not null default 0,
  searches int not null default 0,
  reads int not null default 0,
  in_tokens bigint not null default 0,
  out_tokens bigint not null default 0,
  cost_usd numeric not null default 0,
  model text,
  note text,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists dossier_chunks (
  country_id int not null references countries(id),
  key text not null,
  label text not null,
  question_ids int[] not null default '{}',
  status text not null default 'pending',  -- pending | running | done | error
  calls int not null default 0,
  searches int not null default 0,
  reads int not null default 0,
  in_tokens bigint not null default 0,
  out_tokens bigint not null default 0,
  cost_usd numeric not null default 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  primary key (country_id, key)
);
create table if not exists dossier_log (
  id bigserial primary key,
  country_id int not null references countries(id),
  chunk text,
  kind text not null,            -- search | read | answer | note | error | step
  text text not null,
  url text,
  at timestamptz not null default now()
);
create index if not exists dossier_log_at on dossier_log (at desc);
create table if not exists dossier_maps (
  country_id int primary key references countries(id),
  map jsonb not null,
  created_at timestamptz not null default now()
);

alter table answers enable row level security;
alter table scores enable row level security;
alter table dossier_runs enable row level security;
alter table dossier_chunks enable row level security;
alter table dossier_log enable row level security;
alter table dossier_maps enable row level security;

insert into dossier_runs (country_id, status, note) values
  (1001, 'preparing', 'first in line'), (1002, 'preparing', null), (1003, 'preparing', null),
  (1004, 'preparing', null), (1005, 'preparing', null), (1006, 'preparing', null)
on conflict (country_id) do nothing;

-- one call that feeds ola.cx/mrd/dossiers
create or replace function dossiers_dashboard() returns jsonb language sql stable as $$
select jsonb_build_object(
  'now', now(),
  'countries', (select coalesce(jsonb_agg(c order by (c->>'id')::int), '[]') from (
     select jsonb_build_object('id', co.id, 'iso', co.iso, 'slug', co.slug, 'name', co.name_en,
       'status', r.status, 'note', r.note, 'model', r.model,
       'chunks_done', r.chunks_done, 'chunks_total', r.chunks_total,
       'questions_done', r.questions_done, 'questions_total', r.questions_total,
       'calls', r.calls, 'searches', r.searches, 'reads', r.reads,
       'in_tokens', r.in_tokens, 'out_tokens', r.out_tokens, 'cost_usd', r.cost_usd,
       'started_at', r.started_at, 'finished_at', r.finished_at, 'updated_at', r.updated_at,
       'citations', (select count(*) from citations ci where ci.country_id = co.id),
       'laws', (select count(*) from laws l where l.country_id = co.id),
       'texts', (select count(*) from laws l where l.country_id = co.id and l.find_status = 'found'),
       'scores', (select jsonb_object_agg(s.score_type, s.score) from scores s join categories ca on ca.id = s.category_id
                  where s.country_id = co.id and ca.macrogroup = 'TOTAL SCORE'),
       'chunks', (select coalesce(jsonb_agg(jsonb_build_object('key', ch.key, 'label', ch.label, 'status', ch.status,
                    'n', coalesce(array_length(ch.question_ids, 1), 0), 'cost_usd', ch.cost_usd, 'searches', ch.searches,
                    'reads', ch.reads, 'started_at', ch.started_at, 'finished_at', ch.finished_at) order by ch.started_at nulls last, ch.key), '[]')
                  from dossier_chunks ch where ch.country_id = co.id)) c
     from dossier_runs r join countries co on co.id = r.country_id) x),
  'recent', (select coalesce(jsonb_agg(r), '[]') from (
     select l.id, co.name_en as country, co.iso, l.chunk, l.kind, l.text, l.url, l.at
     from dossier_log l join countries co on co.id = l.country_id order by l.at desc limit 40) r),
  'answers', (select count(*) from answers where experimental),
  'totals', (select jsonb_build_object('cost_usd', coalesce(sum(cost_usd), 0), 'searches', coalesce(sum(searches), 0),
               'reads', coalesce(sum(reads), 0), 'calls', coalesce(sum(calls), 0),
               'in_tokens', coalesce(sum(in_tokens), 0), 'out_tokens', coalesce(sum(out_tokens), 0)) from dossier_runs)
) $$;
revoke execute on function dossiers_dashboard() from public, anon, authenticated;
