-- Pinned topics. A non-null pinned_at means the topic is pinned; the value
-- also drives pin order (most-recently-pinned first). Null = not pinned.
-- Surfaced in the Topics list under a "Pinned" section, toggled from the
-- topic's context menu. See TopicsView.swift / api/f2/topics.
alter table f2_threads add column if not exists pinned_at timestamptz;
