-- F2: Peck or Perish, the rest-stop minigame (levels 5, 15, 25, …). One row
-- per player per rest stop: the best year they kept the dodo alive until and
-- how many rounds they played there. The board for a rest stop is every row
-- with that level, best year first (src/lib/f2/peck-game.ts).
create table if not exists f2_peck_game_scores (
  user_id    uuid not null references f2_users(id) on delete cascade,
  level      int  not null,
  best_year  int  not null,
  plays      int  not null default 1,
  best_at    timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, level)
);

create index if not exists f2_peck_game_scores_board
  on f2_peck_game_scores (level, best_year desc, best_at);

alter table f2_peck_game_scores enable row level security;

notify pgrst, 'reload schema';
