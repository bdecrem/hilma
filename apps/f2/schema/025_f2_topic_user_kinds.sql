-- F2: user-settable topic types.
--
-- The kind column (013) was auto-classified only (chat/web/audio/video/paste/
-- fallback). The Rename Topic sheet now lets the user override it, and adds
-- three human types that classification can't infer: 'book', 'mini' (a small
-- quick topic), and 'general' (a general topic that isn't a book). Existing
-- auto values stay valid; creation-time classification is unchanged.

alter table f2_threads
  drop constraint if exists f2_threads_kind_check;

alter table f2_threads
  add constraint f2_threads_kind_check
    check (kind in ('chat', 'web', 'audio', 'video', 'paste', 'fallback',
                    'book', 'mini', 'general'));
