-- F2: topic source kind.
-- Drives which glyph the Topics list renders next to each row. Computed on
-- thread creation by classifyTopicKind() in src/lib/f2/threads.ts and stored
-- here so the listing query is a flat read with no per-row inference cost.

alter table f2_threads
  add column if not exists kind text not null default 'fallback';

alter table f2_threads
  add constraint f2_threads_kind_check
    check (kind in ('chat', 'web', 'audio', 'video', 'paste', 'fallback'));

-- Backfill existing rows. Mirror the TS logic so the database state matches
-- what classifyTopicKind() would produce now. Order matters — more specific
-- hosts/extensions win before the generic "any URL → web" rule.
update f2_threads
set kind = case
  -- Audio file extensions (any host).
  when url ~* '\.(mp3|m4a|wav|aac|ogg|flac)(\?|$)' then 'audio'
  -- Video file extensions.
  when url ~* '\.(mp4|mov|webm|mkv|avi)(\?|$)' then 'video'
  -- Known video hosts.
  when url ~* '(^|\.)youtube\.com|(^|\.)youtu\.be|(^|\.)vimeo\.com' then 'video'
  -- Known audio hosts.
  when url ~* '(^|\.)open\.spotify\.com|(^|\.)anchor\.fm|(^|\.)podcasts\.apple\.com|(^|\.)overcast\.fm' then 'audio'
  -- Any other URL is a generic web page.
  when url is not null and url <> '' then 'web'
  -- No URL but content present → user pasted text in.
  when content is not null and content <> '' then 'paste'
  -- No URL, no content, but a topic name → a chat-started thread.
  when topic is not null and topic <> '' then 'chat'
  else 'fallback'
end
where kind = 'fallback';
