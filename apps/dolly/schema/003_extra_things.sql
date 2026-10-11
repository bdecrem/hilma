-- Dolly: the things an extra call (Talk more) produced, one list per call (2026-10-10).
alter table dolly_days add column if not exists extra_things jsonb not null default '[]'::jsonb;
