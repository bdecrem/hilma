-- P4 (2026-11-27, OLA-485). Bart: "do a pass and mark p4 a bunch of stuff". P4 is the shelf: kept,
-- not closed, below P2, never picked ahead of anything else. Apply: supabase db query --linked -f <this file>.
alter table venture_issues drop constraint if exists venture_issues_priority_check;
alter table venture_issues add constraint venture_issues_priority_check check (priority in ('P0', 'P1', 'P2', 'P4'));
