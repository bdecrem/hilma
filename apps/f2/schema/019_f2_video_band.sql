-- "new short|medium|long" video topics remember their length band so that
-- follow-ups like "give me 3 other ones" search the same band. Null for
-- topics not created by the video-setup flow (legacy "setup:" topics fall
-- back to 'long' at read time).
alter table f2_threads add column if not exists video_band text;
