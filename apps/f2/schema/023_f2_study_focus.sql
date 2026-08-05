-- F2: per-topic study focus.
--
-- A short user instruction ("only the first half — I haven't finished the
-- book") that scopes every testing surface — flash card generation, chat
-- quizzes, and the Final Review script + judge — to the part of the material
-- the user actually studied. Null = no focus, test on everything.
alter table f2_threads add column if not exists study_focus text;
