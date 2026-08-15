-- Per-topic opt-out from Peck (jumbo) sets. Included by default.
alter table f2_threads
  add column if not exists peck_excluded boolean not null default false;
