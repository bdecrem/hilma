-- Due diligence over the experimental dossiers (apps/mrd/dossiers/PLAN.md, audit.py): one row per
-- indicator with what each check found and where the answer stands.

create table if not exists dossier_checks (
  country_id int not null references countries(id),
  question_id int not null references questions(id),     -- the protection question
  status text not null default 'pending',                 -- pending | verified | changed | review
  original jsonb,            -- the first coder's answer as it stood when the checks began
  source_check jsonb,        -- Sonnet: every cited source opened, quote found, evidence labelled; pass + failures
  verifier jsonb,            -- Opus, second reader: verdicts, its own answers, reasons
  redo jsonb,                -- Fable: the answer coded again from the primary sources
  redo_source_check jsonb,   -- the source check over the redo
  failed text[] not null default '{}',                    -- why it went to the redo
  before jsonb,              -- what was published before a change
  after jsonb,               -- what is published now
  reason text,               -- one or two sentences: why verified / changed / waiting
  decided_by text,           -- pipeline | a person's name
  updated_at timestamptz not null default now(),
  primary key (country_id, question_id)
);

create table if not exists dossier_check_runs (
  country_id int not null references countries(id),
  phase text not null,       -- sources | verify | redo | sources2
  key text not null,         -- the chunk
  status text not null default 'running',                 -- running | done | error
  model text, effort text,
  calls int not null default 0, searches int not null default 0, reads int not null default 0,
  in_tokens bigint not null default 0, out_tokens bigint not null default 0, cost_usd numeric not null default 0,
  error text,
  started_at timestamptz, finished_at timestamptz,
  primary key (country_id, phase, key)
);

alter table dossier_checks enable row level security;
alter table dossier_check_runs enable row level security;

-- the status of each answer, for the library's country page
create or replace function lib_checks(p_slug text) returns jsonb language sql stable as $$
select coalesce(jsonb_object_agg(k.question_id, jsonb_build_object('status', k.status, 'reason', k.reason)), '{}')
from dossier_checks k join countries co on co.id = k.country_id where lib_slug(co.slug) = p_slug $$;

-- ola.cx/mrd/dossiers/checks: counts per country, what changed, what waits for a person
create or replace function dossier_checks_page() returns jsonb language sql stable as $$
select jsonb_build_object(
  'now', now(),
  'countries', (select coalesce(jsonb_agg(x order by x->>'name'), '[]') from (
     select jsonb_build_object('id', co.id, 'name', co.name_en, 'slug', lib_slug(co.slug), 'iso', co.iso,
       'total', count(*), 'verified', count(*) filter (where k.status = 'verified'),
       'changed', count(*) filter (where k.status = 'changed'), 'review', count(*) filter (where k.status = 'review'),
       'pending', count(*) filter (where k.status = 'pending'),
       'source_checked', count(*) filter (where k.source_check is not null),
       'second_read', count(*) filter (where k.verifier is not null),
       'redone', count(*) filter (where k.redo is not null),
       'cost_usd', (select coalesce(sum(r.cost_usd), 0) from dossier_check_runs r where r.country_id = co.id)) x
     from dossier_checks k join countries co on co.id = k.country_id group by co.id, co.name_en, co.slug, co.iso) y),
  'items', (select coalesce(jsonb_agg(i order by i->>'country', (i->>'question_id')::int), '[]') from (
     select jsonb_build_object('country', co.name_en, 'slug', lib_slug(co.slug), 'question_id', k.question_id, 'question', q.text_en,
       'category', ca.name_en, 'status', k.status, 'reason', k.reason, 'failed', k.failed, 'decided_by', k.decided_by,
       'original', k.original, 'verifier', k.verifier, 'redo', k.redo, 'source_check', k.source_check,
       'redo_source_check', k.redo_source_check, 'updated_at', k.updated_at) i
     from dossier_checks k join countries co on co.id = k.country_id join questions q on q.id = k.question_id
       join categories ca on ca.id = q.category_id
     where k.status in ('changed', 'review')) z)
) $$;
revoke execute on function lib_checks(text) from public, anon, authenticated;
revoke execute on function dossier_checks_page() from public, anon, authenticated;
