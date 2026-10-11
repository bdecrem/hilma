-- Dolly: the scripted star round and 'start today over' (2026-10-10).
alter table dolly_days add column if not exists star_script jsonb;              -- [{dolly, dolly_en, you_en, you, target_id}]
alter table dolly_voice_sessions add column if not exists script_step int;      -- the script line Dolly last said (from the [[step:N]] marker)
