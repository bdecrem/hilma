-- Mixed flash mode: half multiple choice, half typed answers in one set.
alter table f2_flash_sets drop constraint if exists f2_flash_sets_mode_check;
alter table f2_flash_sets add constraint f2_flash_sets_mode_check
  check (mode = any (array['choice','text','voice','mixed']));
