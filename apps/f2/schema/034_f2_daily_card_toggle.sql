-- Daily card becomes a toggle on the paired iMessage handle instead of a
-- second phone-number field. Users who had a number keep receiving cards.
alter table f2_users
  add column if not exists daily_card_enabled boolean not null default false;
update f2_users set daily_card_enabled = true where phone is not null;
alter table f2_users drop column if exists phone;
