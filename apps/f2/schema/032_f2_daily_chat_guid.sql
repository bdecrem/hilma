-- Optional per-user iMessage chat override for the daily card. Needed when
-- the recipient's handle belongs to the SAME Apple ID the sending Mac's
-- Messages is signed into: sending to the phone number makes a self-chat
-- whose replies arrive is_from_me and get dropped, while a chat addressed
-- to an email alias of the account delivers replies as inbound.
alter table f2_users
  add column if not exists daily_chat_guid text;
