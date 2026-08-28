-- Per-topic Peck draw multiplier. Jumbo sampling multiplies each card's
-- schedule weight by its topic's peck_weight (chips: 0.5 / 1 / 2 / 5), so a
-- one-card mini topic can punch above its size and a fat deck can step back.
-- Applied 2026-08-27.
alter table f2_threads add column if not exists peck_weight real not null default 1;
