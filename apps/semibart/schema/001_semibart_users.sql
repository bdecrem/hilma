-- CASBS Quest accounts (2026-11-12). One row per character: every fellow (and Bart) is
-- seeded here, so nobody signs up; you sign in with your first name and a passcode.
-- The passcode starts as your study number (passcode_hash null means "the study number");
-- you change it to four digits of your own in your study. character is the game's lowercase
-- slug, the same key the rooms use; a character has exactly one owner.
-- Apply: supabase db query --linked -f apps/semibart/schema/001_semibart_users.sql
-- Server code only (service key); row-level security on, no policies, as for takt_*.

create table if not exists semibart_users (
  id uuid primary key default gen_random_uuid(),
  character text not null unique,             -- 'bart', 'daniel', 'inbal'
  login text not null unique,                 -- the first name you type: 'fran', 'jim'
  aliases text[] not null default '{}',       -- other names that also work: 'frances', 'james'
  name text not null,                         -- as the CASBS directory gives it
  study text not null,                        -- '16', '016'
  role text not null default 'user' check (role in ('user', 'admin')),
  passcode_hash text,                         -- null: the passcode is still the study number
  passcode_set_at timestamptz,
  session_version integer not null default 1, -- bumped on a passcode change: other sessions end
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
alter table semibart_users enable row level security;

insert into semibart_users (character, login, aliases, name, study, role) values
  ('bart', 'bart', '{}', 'Bart Decrem', '16', 'admin'),
  ('daniel', 'daniel', '{}', 'Daniel Chen', '1', 'user'),
  ('kahwee', 'kah-wee', '{kahwee,"kah wee"}', 'Kah-Wee Lee', '2', 'user'),
  ('mary', 'mary', '{"mary helen"}', 'Mary Helen Immordino-Yang', '4', 'user'),
  ('luke', 'luke', '{}', 'Luke Miratrix', '5', 'user'),
  ('lewis', 'lewis', '{}', 'Lewis Asante', '6', 'user'),
  ('lawrence', 'lawrence', '{}', 'Lawrence Cheung', '7', 'user'),
  ('brooke', 'brooke', '{}', 'Brooke Harrington', '8', 'user'),
  ('katharyne', 'katharyne', '{}', 'Katharyne Mitchell', '9', 'user'),
  ('frances', 'fran', '{frances}', 'Fran Moore', '10', 'user'),
  ('james', 'jim', '{james}', 'Jim Goldgeier', '11', 'user'),
  ('frederick', 'fred', '{frederick}', 'Fred Singer', '12', 'user'),
  ('john', 'john', '{}', 'John Casellas Connors', '13', 'user'),
  ('garance', 'garance', '{}', 'Garance Burke', '14', 'user'),
  ('graeme', 'graeme', '{}', 'Graeme Blair', '15', 'user'),
  ('kevin', 'kevin', '{}', 'Kevin Driscoll', '27', 'user'),
  ('mikael', 'mikael', '{}', 'Mikael Jakobsson', '27', 'user'),
  ('raul', 'raul', '{}', 'Raul Saucedo', '27', 'user'),
  ('jacqueline', 'jacqueline', '{"chi kei"}', 'Jacqueline Lam', '28', 'user'),
  ('jurate', 'jurate', '{}', 'Jurate Jaraite-Kazukauske', '28', 'user'),
  ('ian', 'ian', '{}', 'Ian Kysel', '29', 'user'),
  ('ishara', 'ishara', '{}', 'Ishara Casellas Connors', '29', 'user'),
  ('juliana', 'juliana', '{}', 'Juliana Bidadanure', '30', 'user'),
  ('inbal', 'inbal', '{}', 'Inbal Ben Ami Bartal', '31', 'user'),
  ('milena', 'milena', '{}', 'Milena Tsvetkova', '32', 'user'),
  ('tl', 'tl', '{t.l.,t.l}', 'TL Taylor', '33', 'user'),
  ('eli', 'eli', '{}', 'Eli Cook', '34', 'user'),
  ('summerson', 'summerson', '{}', 'Summerson Carr', '35', 'user'),
  ('alison', 'alison', '{}', 'Alison McQueen', '36', 'user'),
  ('salman', 'salman', '{}', 'Salman Chaudhry', '37', 'user'),
  ('june', 'june', '{}', 'June Gruber', '38', 'user'),
  ('lynda', 'lynda', '{}', 'Lynda Powell', '39', 'user'),
  ('robert', 'bob', '{robert}', 'Bob Kaplan', '40', 'user'),
  ('ralph', 'rick', '{ralph,richard}', 'Rick Banks', '41', 'user'),
  ('dessislava', 'dessislava', '{dessi}', 'Dessislava Lange-Damianova', '42', 'user'),
  ('joseph', 'joseph', '{}', 'Joseph Tao-yi Wang', '43', 'user'),
  ('forrest', 'forrest', '{}', 'Forrest Stuart', '44', 'user'),
  ('jamie', 'jamie', '{}', 'Jamie Kreiner', '45', 'user'),
  ('kepa', 'kepa', '{}', 'Kepa Korta', '46', 'user'),
  ('henry', 'henry', '{}', 'Henry Cowles', '47', 'user'),
  ('corey', 'corey', '{}', 'Corey Abramson', '48', 'user'),
  ('lana', 'lana', '{}', 'Lana Swartz', '49', 'user'),
  ('shigehiro', 'shige', '{shigehiro}', 'Shige Oishi', '50', 'user'),
  ('andrius', 'andrius', '{}', 'Andrius Kazukauskas', '51', 'user'),
  ('bryn', 'bryn', '{}', 'Bryn Rosenfeld', '52', 'user'),
  ('brian', 'brian', '{}', 'Brian Knutson', '53', 'user'),
  ('heeju', 'heeju', '{}', 'Heeju Sohn', '54', 'user'),
  ('toussaint', 'toussaint', '{}', 'Toussaint Nothias', '016', 'user'),
  ('matthew', 'matt', '{matthew}', 'Matt Sparke', '016', 'user')
on conflict (character) do nothing;
