-- The library shows the experimental dossiers apart: every function carries the country's flag,
-- lib_country adds the dossier itself (overview, scores, the answer and implementation per indicator).

create or replace function lib_home() returns jsonb language sql stable as $$
select jsonb_build_object(
  'stats', (select jsonb_build_object(
      'laws', count(*), 'texts', count(*) filter (where find_status = 'found'),
      'links', count(*) filter (where find_status = 'linked'),
      'missing', count(*) filter (where find_status not in ('found', 'linked')),
      'chars', coalesce(sum(text_chars), 0),
      'languages', count(distinct language) filter (where text is not null),
      'countries', count(distinct country_id),
      'citations', (select count(*) from citations)) from laws),
  'kinds', (select jsonb_object_agg(kind, n) from (select kind, count(*) n from laws group by 1) k),
  'countries', (select jsonb_agg(jsonb_build_object('iso', co.iso, 'slug', lib_slug(co.slug), 'name', co.name_en, 'experimental', co.experimental,
        'laws', (select count(*) from laws l where l.country_id = co.id),
        'texts', (select count(*) from laws l where l.country_id = co.id and l.find_status = 'found'),
        'citations', (select count(*) from citations c where c.country_id = co.id),
        'cats', (select coalesce(jsonb_object_agg(lib_slug(ca.slug), n), '{}') from (
            select lq.category_id, count(distinct lq.law_id) n from law_questions lq where lq.country_id = co.id group by 1) x
            join categories ca on ca.id = x.category_id)) order by co.name_en)
      from countries co where exists (select 1 from laws l where l.country_id = co.id)
         or (co.experimental and exists (select 1 from citations c where c.country_id = co.id))),
  'categories', (select jsonb_agg(jsonb_build_object('slug', lib_slug(ca.slug), 'name', ca.name_en, 'group', ca.macrogroup,
        'laws', (select count(distinct law_id) from law_questions lq where lq.category_id = ca.id),
        'questions', (select count(*) from questions q where q.category_id = ca.id and q.type = 'Protection')) order by ca.name_en)
      from categories ca where ca.macrogroup not in ('-', 'TOTAL SCORE'))
) $$;

create or replace function lib_country(p_slug text) returns jsonb language sql stable as $$
with co as (select * from countries where lib_slug(slug) = p_slug),
     yr as (select max(year) y from answers a, co where a.country_id = co.id)
select jsonb_build_object(
  'name', co.name_en, 'iso', co.iso, 'slug', lib_slug(co.slug), 'experimental', co.experimental,
  'description', co.description_en, 'coded_at', co.coded_at, 'coded_by', co.coded_by, 'year', (select y from yr),
  'stats', (select jsonb_build_object('laws', count(*), 'texts', count(*) filter (where find_status = 'found'),
              'links', count(*) filter (where find_status = 'linked'), 'chars', coalesce(sum(text_chars), 0)) from laws where country_id = co.id),
  'scores', (select coalesce(jsonb_agg(x order by (x->>'group') = 'TOTAL SCORE' desc, x->>'name'), '[]') from (
      select jsonb_build_object('slug', lib_slug(ca.slug), 'name', ca.name_en, 'group', ca.macrogroup,
        'protection', max(s.score) filter (where s.score_type = 'Protection'),
        'implementation', max(s.score) filter (where s.score_type = 'Implementation'),
        'adjusted', max(s.score) filter (where s.score_type = 'Adjusted')) x
      from scores s join categories ca on ca.id = s.category_id
      where s.country_id = co.id and s.year = (select max(year) from scores where country_id = co.id)
      group by ca.id, ca.slug, ca.name_en, ca.macrogroup) y),
  'categories', (select coalesce(jsonb_agg(jsonb_build_object('slug', lib_slug(ca.slug), 'name', ca.name_en, 'group', ca.macrogroup,
      'questions', (select jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text_en,
          'answer', (select jsonb_build_object('text', a.answer, 'score', a.subscore, 'confidence', a.confidence, 'notes', a.notes)
                     from answers a where a.country_id = co.id and a.question_id = q.id and a.year = (select y from yr)),
          'implementation', (select jsonb_build_object('text', a.answer, 'score', a.subscore, 'evidence', a.evidence, 'sources', a.sources)
                     from answers a where a.country_id = co.id and a.question_id = q.id + 1 and a.year = (select y from yr)),
          'citations', (select jsonb_agg(jsonb_build_object('id', c.id, 'text', c.text_en, 'local', c.local_text_en, 'international', c.international_text_en,
              'laws', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', coalesce(l.name_en, l.name_cited), 'kind', l.kind,
                         'year', l.enacted_year, 'status', lib_status(l.find_status), 'articles', cl.articles) order by l.name_en), '[]')
                       from citation_laws cl join laws l on l.id = cl.law_id where cl.citation_id = c.id)) order by c.id)
            from citations c where c.country_id = co.id and c.question_id = q.id)) order by q.id)
        from questions q where q.category_id = ca.id and exists (select 1 from citations c where c.country_id = co.id and c.question_id = q.id)))
      order by ca.name_en), '[]')
    from categories ca where ca.macrogroup not in ('-', 'TOTAL SCORE')
      and exists (select 1 from citations c join questions q on q.id = c.question_id where c.country_id = co.id and q.category_id = ca.id)),
  'laws', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', coalesce(l.name_en, l.name_cited), 'official', l.name_official,
             'kind', l.kind, 'year', l.enacted_year, 'status', lib_status(l.find_status), 'chars', l.text_chars, 'language', l.language,
             'cites', (select count(*) from citation_laws cl where cl.law_id = l.id))
           order by l.kind, coalesce(l.name_en, l.name_cited)), '[]') from laws l where l.country_id = co.id)
) from co $$;

create or replace function lib_category(p_slug text) returns jsonb language sql stable as $$
with ca as (select * from categories where lib_slug(slug) = p_slug)
select jsonb_build_object('slug', lib_slug(ca.slug), 'name', ca.name_en, 'group', ca.macrogroup,
  'questions', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'text', q.text_en,
      'countries', (select coalesce(jsonb_agg(jsonb_build_object('name', co.name_en, 'iso', co.iso, 'slug', lib_slug(co.slug), 'experimental', co.experimental,
          'laws', (select coalesce(jsonb_agg(distinct jsonb_build_object('id', l.id, 'name', coalesce(l.name_en, l.name_cited), 'kind', l.kind,
                     'year', l.enacted_year, 'status', lib_status(l.find_status), 'articles', cl.articles)), '[]')
                   from citations c join citation_laws cl on cl.citation_id = c.id join laws l on l.id = cl.law_id
                   where c.country_id = co.id and c.question_id = q.id)) order by co.experimental, co.name_en), '[]')
        from countries co where exists (select 1 from citations c where c.country_id = co.id and c.question_id = q.id))) order by q.id), '[]')
    from questions q where q.category_id = ca.id and q.type = 'Protection')
) from ca $$;

-- lib_search and lib_law: the same bodies as 20261106030000_library.sql, plus the flag on the country
create or replace function lib_search(p_q text default null, p_country text default null, p_category text default null,
                                      p_kind text default null, p_status text default null, p_page int default 1, p_per int default 20)
returns jsonb language plpgsql stable as $$
declare
  q text := nullif(trim(p_q), '');
  sq tsquery; eq tsquery; word text;
  ids uuid[]; total int; rows jsonb;
begin
  if q is not null then
    sq := websearch_to_tsquery('simple', q);
    eq := websearch_to_tsquery('english', q);
    select w into word from regexp_split_to_table(lower(regexp_replace(q, '["()-]|\m(or|and)\M', ' ', 'gi')), '\s+') w
      where length(w) >= 3 order by length(w) desc limit 1;
  end if;

  with hits as (
    select id, 0 w from laws where q is null
    union all select id, 1 from laws where q is not null and fts @@ sq
    union all select cl.law_id, 2 from citation_laws cl join citations c on c.id = cl.citation_id where q is not null and c.fts @@ eq
    union all select id, 4 from laws where q is not null and (
        name_cited ilike '%' || q || '%' or name_official ilike '%' || q || '%' or name_en ilike '%' || q || '%'
        or to_tsvector('english', coalesce(name_en, '') || ' ' || name_cited) @@ eq
        or to_tsvector('simple', coalesce(name_official, '') || ' ' || name_cited) @@ sq)
  ), scored as (
    select id, sum(distinct w) score from hits group by id
  ), base as (
    select l.id, co.name_en country, s.score,
           (select count(*) from citation_laws cl where cl.law_id = l.id) cites,
           coalesce(l.name_en, l.name_cited) nm
    from scored s join laws l on l.id = s.id join countries co on co.id = l.country_id
    where (p_country is null or lib_slug(co.slug) = p_country)
      and (p_kind is null or l.kind::text = p_kind)
      and (p_status is null or lib_status(l.find_status) = p_status)
      and (p_category is null or exists (select 1 from law_questions lq join categories ca on ca.id = lq.category_id
                                          where lq.law_id = l.id and lib_slug(ca.slug) = p_category))
  )
  select count(*), array_agg(id order by score desc, case when q is null then country end, cites desc, nm)
    into total, ids from base;

  ids := ids[((p_page - 1) * p_per + 1):(p_page * p_per)];

  select coalesce(jsonb_agg(r order by array_position(ids, (r->>'id')::uuid)), '[]') into rows from (
    select jsonb_build_object(
      'id', l.id, 'name', coalesce(l.name_en, l.name_cited), 'official', l.name_official, 'cited', l.name_cited,
      'kind', l.kind, 'year', l.enacted_year, 'number', l.number, 'court', l.court, 'status', lib_status(l.find_status),
      'language', l.language, 'domain', l.source_domain, 'chars', l.text_chars,
      'country', jsonb_build_object('name', co.name_en, 'iso', co.iso, 'slug', lib_slug(co.slug), 'experimental', co.experimental),
      'cats', lib_law_cats(l.id),
      'cites', (select count(*) from citation_laws cl where cl.law_id = l.id),
      'snippet', case
        when q is null then null
        when l.text is not null and l.fts @@ sq then (
          select ts_headline('simple', substr(l.text, greatest(1, p - 260), 700), sq,
                             'StartSel=⟦,StopSel=⟧,MaxWords=40,MinWords=18,MaxFragments=1,HighlightAll=false')
          from (select coalesce(nullif(strpos(lower(l.text), word), 0), 1) p) pp)
        else (select ts_headline('english', c.text_en, eq, 'StartSel=⟦,StopSel=⟧,MaxWords=40,MinWords=18,MaxFragments=1')
              from citation_laws cl join citations c on c.id = cl.citation_id
              where cl.law_id = l.id and c.fts @@ eq limit 1) end,
      'snippet_from', case when q is null then null when l.text is not null and l.fts @@ sq then 'text' else 'citation' end
    ) r
    from laws l join countries co on co.id = l.country_id where l.id = any(ids)) x;

  return jsonb_build_object('total', coalesce(total, 0), 'rows', rows);
end $$;

create or replace function lib_law(p_id uuid) returns jsonb language sql stable as $$
select jsonb_build_object(
  'id', l.id, 'name', coalesce(l.name_en, l.name_cited), 'name_en', l.name_en, 'official', l.name_official, 'cited', l.name_cited,
  'kind', l.kind, 'number', l.number, 'court', l.court, 'year', l.enacted_year, 'date', l.enacted_date,
  'in_force', l.status, 'language', l.language, 'url', l.source_url, 'domain', l.source_domain,
  'official_source', l.source_official, 'format', l.source_format, 'file', l.storage_path is not null,
  'chars', l.text_chars, 'status', lib_status(l.find_status), 'fetched_at', l.fetched_at,
  'country', jsonb_build_object('name', co.name_en, 'iso', co.iso, 'slug', lib_slug(co.slug), 'experimental', co.experimental),
  'citations', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'articles', cl.articles, 'quote', cl.quote, 'text', c.text_en,
        'question', q.text_en, 'question_id', q.id,
        'cat', jsonb_build_object('slug', lib_slug(ca.slug), 'name', ca.name_en, 'group', ca.macrogroup))
        order by ca.name_en, q.id, c.id), '[]')
      from citation_laws cl join citations c on c.id = cl.citation_id
      left join questions q on q.id = c.question_id left join categories ca on ca.id = q.category_id
      where cl.law_id = l.id),
  'related', (select coalesce(jsonb_agg(r), '[]') from (
      select jsonb_build_object('id', l2.id, 'name', coalesce(l2.name_en, l2.name_cited), 'kind', l2.kind,
                                'year', l2.enacted_year, 'status', lib_status(l2.find_status), 'shared', count(distinct c2.question_id)) r
      from citation_laws cl join citations c on c.id = cl.citation_id
      join citations c2 on c2.country_id = c.country_id and c2.question_id = c.question_id
      join citation_laws cl2 on cl2.citation_id = c2.id join laws l2 on l2.id = cl2.law_id
      where cl.law_id = l.id and l2.id <> l.id
      group by l2.id order by count(distinct c2.question_id) desc, coalesce(l2.name_en, l2.name_cited) limit 10) x)
) from laws l join countries co on co.id = l.country_id where l.id = p_id $$;

revoke execute on function lib_home(), lib_search(text, text, text, text, text, int, int), lib_law(uuid),
  lib_country(text), lib_category(text) from public, anon, authenticated;
