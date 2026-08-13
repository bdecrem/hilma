-- Optional per-user iMessage chat override for the daily card. Needed when
-- the recipient's handle belongs to the SAME Apple ID the Mac mini's
-- Messages is signed into (Bart's setup): sending to the phone number makes
-- a self-chat whose replies arrive is_from_me and get dropped, while the
-- alias-addressed chat (kurona@me.com) delivers replies as inbound.
alter table f2_users
  add column if not exists daily_chat_guid text;
