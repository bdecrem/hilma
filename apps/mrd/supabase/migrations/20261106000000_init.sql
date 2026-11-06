-- MRD source-law store. The MRD tables mirror the Migrant Rights Database;
-- laws are the statutes, regulations and court decisions its citations point to.

create table countries (
  id int primary key,            -- MRD id
  iso text not null,             -- as MRD codes it (JAP, HNG are not ISO)
  slug text not null unique,
  name_en text not null
);

create table categories (
  id int primary key,
  slug text not null unique,
  name_en text not null,
  macrogroup text
);

create table questions (
  id int primary key,
  category_id int references categories(id),
  type text,                     -- Protection | Implementation
  parent_question_id int references questions(id),
  text_en text not null
);

create table citations (
  id int primary key,            -- MRD citation id
  country_id int not null references countries(id),
  question_id int references questions(id),
  text_en text not null,
  local_text_en text,
  international_text_en text,
  extracted jsonb,               -- raw extraction output
  extracted_at timestamptz
);

create type law_kind as enum (
  'constitution', 'statute', 'regulation', 'decree', 'executive_order',
  'administrative_guidance', 'court_decision', 'treaty', 'other');

create type find_status as enum (
  'pending', 'found', 'not_found', 'paywalled', 'error', 'skipped');

create table laws (
  id uuid primary key default gen_random_uuid(),
  country_id int not null references countries(id),
  dedupe_key text not null,      -- normalized name, unique per country
  name_cited text not null,      -- as the citation writes it
  name_official text,            -- in the original language
  name_en text,
  kind law_kind not null default 'other',
  number text,                   -- "Act 13 of 2002", "Ley 1070", case number
  court text,                    -- for decisions
  enacted_year int,
  enacted_date date,
  status text,                   -- in_force | amended | repealed | unknown
  language text,                 -- ISO 639-1 of the stored text
  source_url text,
  source_domain text,
  source_official boolean,       -- government / court / gazette host
  source_format text,            -- html | pdf | other
  storage_path text,             -- original file in the 'sources' bucket
  text text,                     -- extracted full text
  text_chars int generated always as (length(text)) stored,
  fts tsvector generated always as (to_tsvector('simple', coalesce(name_en,'') || ' ' || coalesce(name_official,'') || ' ' || coalesce(text,''))) stored,
  find_status find_status not null default 'pending',
  find_notes text,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_id, dedupe_key)
);
create index laws_fts on laws using gin (fts);
create index laws_status on laws (find_status);

create table citation_laws (
  citation_id int not null references citations(id) on delete cascade,
  law_id uuid not null references laws(id) on delete cascade,
  articles text not null default '',   -- "Art. 2, 113", "s. 34(1)"
  quote text,                           -- passage the citation quotes, if any
  primary key (citation_id, law_id, articles)
);
create index citation_laws_law on citation_laws (law_id);

create table find_log (
  id bigserial primary key,
  law_id uuid not null references laws(id) on delete cascade,
  at timestamptz not null default now(),
  queries text[],
  candidates jsonb,
  chosen_url text,
  outcome find_status not null,
  notes text
);

-- one row per law × question, for "which laws back indicator X in country Y"
create view law_questions as
select l.id as law_id, l.country_id, c.question_id, q.category_id,
       cl.articles, cl.quote, c.id as citation_id
from citation_laws cl
join citations c on c.id = cl.citation_id
join laws l on l.id = cl.law_id
left join questions q on q.id = c.question_id;

-- service key only for now; no public policies
alter table countries enable row level security;
alter table categories enable row level security;
alter table questions enable row level security;
alter table citations enable row level security;
alter table laws enable row level security;
alter table citation_laws enable row level security;
alter table find_log enable row level security;

insert into storage.buckets (id, name, public) values ('sources', 'sources', false)
on conflict (id) do nothing;
