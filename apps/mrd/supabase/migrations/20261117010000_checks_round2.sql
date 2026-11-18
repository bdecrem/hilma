-- A recode whose own sources fail the source check gets one repair round before a person is asked;
-- the first recode is kept here.
alter table dossier_checks add column if not exists redo_first jsonb;
