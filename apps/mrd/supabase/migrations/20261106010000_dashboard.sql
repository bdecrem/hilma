-- progress heartbeats from the crawl scripts, and one call that feeds ola.cx/mrd

create table runs (
  step text primary key,          -- extract | find | ...
  status text not null default 'running',   -- running | done | stopped | error
  done int not null default 0,
  total int not null default 0,
  calls int not null default 0,
  searches int not null default 0,
  cost_usd numeric not null default 0,
  note text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table runs enable row level security;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger laws_touch before update on laws for each row execute function touch_updated_at();

alter view law_questions set (security_invoker = true);

create or replace function dashboard() returns jsonb language sql stable as $$
select jsonb_build_object(
  'now', now(),
  'citations', (select jsonb_build_object('total', count(*), 'extracted', count(extracted_at)) from citations),
  'laws', (select count(*) from laws),
  'links', (select count(*) from citation_laws),
  'by_status', (select coalesce(jsonb_object_agg(find_status, n), '{}') from (select find_status, count(*) n from laws group by 1) s),
  'by_kind', (select coalesce(jsonb_object_agg(kind, n), '{}') from (select kind, count(*) n from laws group by 1) s),
  'texts', (select jsonb_build_object('count', count(text), 'chars', coalesce(sum(text_chars), 0),
                                      'official', count(*) filter (where text is not null and source_official)) from laws),
  'countries', (select coalesce(jsonb_agg(c order by c->>'name'), '[]') from (
     select jsonb_build_object('iso', co.iso, 'name', co.name_en,
       'citations', (select count(*) from citations ci where ci.country_id = co.id),
       'extracted', (select count(extracted_at) from citations ci where ci.country_id = co.id),
       'laws', (select count(*) from laws l where l.country_id = co.id),
       'found', (select count(*) from laws l where l.country_id = co.id and l.find_status = 'found'),
       'missing', (select count(*) from laws l where l.country_id = co.id and l.find_status in ('not_found','paywalled','error'))) c
     from countries co where exists (select 1 from citations ci where ci.country_id = co.id)) x),
  'recent', (select coalesce(jsonb_agg(r), '[]') from (
     select l.name_en as name, co.name_en as country, co.iso, l.kind, l.find_status as status, l.source_domain as domain,
            l.source_url as url, l.enacted_year as year, l.updated_at as at
     from laws l join countries co on co.id = l.country_id order by l.updated_at desc limit 14) r),
  'runs', (select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at), '[]') from runs r)
) $$;
revoke execute on function dashboard() from public, anon, authenticated;
