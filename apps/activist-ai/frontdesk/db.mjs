// The platform database: one SQLite file, owned by the front desk (node:sqlite, as the gateway).
//
// It holds who may sign in, how (passkeys), their sessions, the teams and workspaces and who
// is in them with which role, and an audit log of what happened to a customer's data. It holds
// no file contents and no free text from users: file names are user text, so the database keeps
// a keyed hash of each name (`name_ref`, HMAC with a key that lives beside the database, not in
// it) plus the file's sha256 and size. A display name is set by the admin, never by the person.
//
// Migrations are numbered and run in order, each in a transaction; the applied ones are in
// `schema_migrations`. The file is created mode 600 in a folder of mode 700.
import { createHmac, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const ROLES = ['owner', 'member', 'viewer']
// The audit log's words in the first schema (migration 1 is frozen; migration 2 widens the list).
const ACTIONS_V1 = [
  'person_added', 'invited', 'passkey_registered', 'signed_in', 'sign_in_refused', 'signed_out', 'sessions_revoked', 'person_suspended',
  'workspace_created', 'member_added', 'member_removed', 'role_changed',
  'file_uploaded', 'file_downloaded', 'file_deleted', 'run_started', 'file_read_by_run', 'shown_to_cloud_agent',
]
// Migration 2's list (frozen too).
const ACTIONS_V2 = [
  ...ACTIONS_V1,
  // migration 2: invitations and devices, secrets
  'invitations_voided', 'device_invited', 'device_added', 'passkey_removed', 'secrets_rotated',
]
// Migration 3's list (frozen too).
const ACTIONS_V3 = [
  ...ACTIONS_V2,
  // migration 3: a rotation's outcome. secrets_rotated is written only once the new secrets are in
  // force; restart_deferred when the workspace was left stopped (the machine was full), to start on
  // its next request; workspace_closed when it could not be made safe; workspace_reopened by the admin.
  'restart_deferred', 'workspace_closed', 'workspace_reopened',
]
// Migration 4's list (frozen too).
const ACTIONS_V4 = [
  ...ACTIONS_V3,
  // migration 4: a page opened from the project ("Open"), and Fallback to Claude
  'page_opened', 'claude_enabled', 'claude_disabled', 'claude_used',
]
// Migration 6's list (frozen too).
const ACTIONS_V6 = [
  ...ACTIONS_V4,
  // migration 6: web search and downloads turned on for a project ("Always in this project") and
  // off again. No search words and no addresses: those are content.
  'web_allowed', 'web_revoked',
]
// Migration 7's list (frozen too).
const ACTIONS_V7 = [
  ...ACTIONS_V6,
  // migration 7: Fallback to a hosted open model turned on, off, used; and one request handed to
  // either fallback "just this once" (the owner's yes on the stretch card, the switch left off)
  'hosted_enabled', 'hosted_disabled', 'hosted_used', 'hosted_once', 'claude_once',
]
// Migration 8's list (frozen too).
const ACTIONS_V8 = [
  ...ACTIONS_V7,
  // migration 8: batch jobs (jobs.mjs): a trial or a whole job started (tokens_in holds the budget
  // approved), paused, resumed, cancelled, finished (tokens_in and tokens_out: what it used).
  'job_trial_started', 'job_started', 'job_paused', 'job_resumed', 'job_cancelled', 'job_finished',
]
/** What the audit log may say. A row with any other action is refused by the table itself. */
export const ACTIONS_V9 = [
  ...ACTIONS_V8,
  // migration 9: "Compare with Claude" (compare.mjs): the real-task switch on and off, the real task
  // sent just this once, a made-up copy made (ok = it may leave; tokens: Ola's own model) and
  // released by the owner's yes, a comparison sent and done (tokens and cost: Claude and the judge).
  'compare_real_enabled', 'compare_real_disabled', 'compare_real_once', 'compare_twin_made', 'compare_twin_released', 'compare_sent', 'compare_done',
]
/** Migration 11's list: devices (devices.mjs), a computer signed in to Ola, out, removed, or refused. */
export const ACTIONS_V11 = [...ACTIONS_V9, 'device_signed_in', 'device_signed_out', 'device_revoked', 'device_refused']
/** Migration 12's list: what the audit log may say now. */
export const ACTIONS_V12 = [
  ...ACTIONS_V11,
  // migration 12: passwords (set from an invitation or a reset link, changed in Your account; a reset
  // link issued by the admin; a burst of wrong passwords for one person), the "ask for my passkey"
  // switch, a passkey added from Your account, and a person's own Macs' weekly allowance set.
  'password_set', 'password_changed', 'password_reset_issued', 'sign_in_burst',
  'passkey_required_on', 'passkey_required_off', 'passkey_added', 'app_allowance_set',
]
export const ACTIONS = ACTIONS_V12

// The comparisons' fixed words (frontdesk/compare.mjs; the labels are the eval set's own list).
const COMPARE_KINDS = ['clean', 'sql', 'coding', 'legal', 'site', 'honesty', 'pdf', 'writing', 'chart', 'other']
const EVAL_LABELS = JSON.parse(readFileSync(new URL('../evals/lib/labels.json', import.meta.url), 'utf8')).failure_labels
const sqlList = (xs) => xs.map((x) => `'${x}'`).join(', ')

const MIGRATIONS = [
  // 1: the whole first schema.
  `
  CREATE TABLE people (
    id INTEGER PRIMARY KEY,
    handle TEXT NOT NULL UNIQUE CHECK (handle GLOB '[a-z]*' AND length(handle) BETWEEN 3 AND 16 AND handle NOT GLOB '*[^a-z0-9-]*'),
    display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 60),
    status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'suspended')),
    is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
    webauthn_user_id BLOB NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_seen_on TEXT
  ) STRICT;

  CREATE TABLE invitations (
    id INTEGER PRIMARY KEY,
    person_id INTEGER NOT NULL REFERENCES people(id),
    token_hash BLOB NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  ) STRICT;

  CREATE TABLE passkeys (
    id INTEGER PRIMARY KEY,
    person_id INTEGER NOT NULL REFERENCES people(id),
    credential_id TEXT NOT NULL UNIQUE,
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL,
    transports TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    last_used_on TEXT
  ) STRICT;

  -- id is the sha256 of the cookie's value: the database never holds a usable session.
  -- No IP address, no user agent.
  CREATE TABLE sessions (
    id BLOB PRIMARY KEY,
    person_id INTEGER NOT NULL REFERENCES people(id),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    revoked_at INTEGER
  ) STRICT;
  CREATE INDEX sessions_person ON sessions(person_id);

  CREATE TABLE teams (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 3 AND 32 AND slug NOT GLOB '*[^a-z0-9-]*'),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    created_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE memberships (
    team_id INTEGER NOT NULL REFERENCES teams(id),
    person_id INTEGER NOT NULL REFERENCES people(id),
    role TEXT NOT NULL CHECK (role IN (${sqlList(ROLES)})),
    added_at INTEGER NOT NULL,
    PRIMARY KEY (team_id, person_id)
  ) STRICT;

  -- slug is the workspace id in workspace/ws.mjs (container ola-<slug>).
  CREATE TABLE workspaces (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 3 AND 32 AND slug NOT GLOB '*[^a-z0-9-]*'),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    team_id INTEGER NOT NULL REFERENCES teams(id),
    status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
    created_at INTEGER NOT NULL
  ) STRICT;

  -- Which files a person uploaded (the rest Ola made): by keyed name hash, never by name.
  CREATE TABLE uploads (
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
    name_ref BLOB NOT NULL,
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    size INTEGER NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (workspace_id, name_ref)
  ) STRICT;

  -- What happened, to whom, by whom. No contents, no names, no free text: every column is a
  -- number, a fixed word, a keyed hash or a sha256.
  CREATE TABLE audit (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('person', 'admin', 'run', 'system')),
    actor_person_id INTEGER REFERENCES people(id),
    action TEXT NOT NULL CHECK (action IN (${sqlList(ACTIONS_V1)})),
    workspace_id INTEGER REFERENCES workspaces(id),
    subject_person_id INTEGER REFERENCES people(id),
    name_ref BLOB,
    sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
    size INTEGER,
    role TEXT CHECK (role IS NULL OR role IN (${sqlList(ROLES)})),
    ok INTEGER NOT NULL DEFAULT 1 CHECK (ok IN (0, 1))
  ) STRICT;
  CREATE INDEX audit_workspace ON audit(workspace_id, at);
  `,
  // 2: invitations of two kinds (a first passkey, or another device for someone who has one), a
  // new invitation voiding the person's earlier unused ones; which passkey a session came from,
  // so a person is told on their next sign-in that a device was added; new audit words (the
  // table is rebuilt: SQLite cannot change a CHECK in place).
  `
  ALTER TABLE invitations ADD COLUMN kind TEXT NOT NULL DEFAULT 'first' CHECK (kind IN ('first', 'device'));
  ALTER TABLE invitations ADD COLUMN voided_at INTEGER;
  ALTER TABLE passkeys ADD COLUMN via TEXT NOT NULL DEFAULT 'first' CHECK (via IN ('first', 'device'));
  ALTER TABLE passkeys ADD COLUMN noticed_at INTEGER;
  ALTER TABLE sessions ADD COLUMN passkey_id INTEGER;
  CREATE TABLE audit_v2 (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('person', 'admin', 'run', 'system')),
    actor_person_id INTEGER REFERENCES people(id),
    action TEXT NOT NULL CHECK (action IN (${sqlList(ACTIONS_V2)})),
    workspace_id INTEGER REFERENCES workspaces(id),
    subject_person_id INTEGER REFERENCES people(id),
    name_ref BLOB,
    sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
    size INTEGER,
    role TEXT CHECK (role IS NULL OR role IN (${sqlList(ROLES)})),
    ok INTEGER NOT NULL DEFAULT 1 CHECK (ok IN (0, 1))
  ) STRICT;
  INSERT INTO audit_v2 SELECT id, at, actor_kind, actor_person_id, action, workspace_id, subject_person_id, name_ref, sha256, size, role, ok FROM audit;
  DROP TABLE audit;
  ALTER TABLE audit_v2 RENAME TO audit;
  CREATE INDEX audit_workspace ON audit(workspace_id, at);
  `,
  // 3: a rotation's outcomes in the audit log (the table rebuilt again for its CHECK).
  `
  CREATE TABLE audit_v3 (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('person', 'admin', 'run', 'system')),
    actor_person_id INTEGER REFERENCES people(id),
    action TEXT NOT NULL CHECK (action IN (${sqlList(ACTIONS_V3)})),
    workspace_id INTEGER REFERENCES workspaces(id),
    subject_person_id INTEGER REFERENCES people(id),
    name_ref BLOB,
    sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
    size INTEGER,
    role TEXT CHECK (role IS NULL OR role IN (${sqlList(ROLES)})),
    ok INTEGER NOT NULL DEFAULT 1 CHECK (ok IN (0, 1))
  ) STRICT;
  INSERT INTO audit_v3 SELECT id, at, actor_kind, actor_person_id, action, workspace_id, subject_person_id, name_ref, sha256, size, role, ok FROM audit;
  DROP TABLE audit;
  ALTER TABLE audit_v3 RENAME TO audit;
  CREATE INDEX audit_workspace ON audit(workspace_id, at);
  `,
  // 4: new audit words (a page opened; Fallback to Claude turned on, off, used) and the numbers a
  // Claude run is recorded with (tokens and cost in millionths of a dollar: numbers only, never
  // content). The table is rebuilt for the CHECK, as in 2 and 3.
  `
  CREATE TABLE audit_v4 (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('person', 'admin', 'run', 'system')),
    actor_person_id INTEGER REFERENCES people(id),
    action TEXT NOT NULL CHECK (action IN (${sqlList(ACTIONS_V4)})),
    workspace_id INTEGER REFERENCES workspaces(id),
    subject_person_id INTEGER REFERENCES people(id),
    name_ref BLOB,
    sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
    size INTEGER,
    role TEXT CHECK (role IS NULL OR role IN (${sqlList(ROLES)})),
    ok INTEGER NOT NULL DEFAULT 1 CHECK (ok IN (0, 1)),
    tokens_in INTEGER CHECK (tokens_in IS NULL OR tokens_in >= 0),
    tokens_out INTEGER CHECK (tokens_out IS NULL OR tokens_out >= 0),
    cost_micro_usd INTEGER CHECK (cost_micro_usd IS NULL OR cost_micro_usd >= 0)
  ) STRICT;
  INSERT INTO audit_v4 (id, at, actor_kind, actor_person_id, action, workspace_id, subject_person_id, name_ref, sha256, size, role, ok)
    SELECT id, at, actor_kind, actor_person_id, action, workspace_id, subject_person_id, name_ref, sha256, size, role, ok FROM audit;
  DROP TABLE audit;
  ALTER TABLE audit_v4 RENAME TO audit;
  CREATE INDEX audit_workspace ON audit(workspace_id, at);
  `,
  // 5: Fallback to Claude, per project (frontdesk/claude.mjs): off by default; when to hand a
  // request over by itself (ask: only when the person asks; stuck: when Ola gets stuck; always);
  // and the month's ceiling if the admin set one (else the front desk's default).
  `
  ALTER TABLE workspaces ADD COLUMN claude_enabled INTEGER NOT NULL DEFAULT 0 CHECK (claude_enabled IN (0, 1));
  ALTER TABLE workspaces ADD COLUMN claude_auto TEXT NOT NULL DEFAULT 'ask' CHECK (claude_auto IN ('ask', 'stuck', 'always'));
  ALTER TABLE workspaces ADD COLUMN claude_cap_micro_usd INTEGER CHECK (claude_cap_micro_usd IS NULL OR claude_cap_micro_usd >= 0);
  ALTER TABLE workspaces ADD COLUMN claude_cap_tokens INTEGER CHECK (claude_cap_tokens IS NULL OR claude_cap_tokens >= 0);
  `,
  // 6: a project's web choice ("Always in this project", or ask each time: no row), and its two
  // audit words. The audit table is rebuilt for the CHECK, as in 2, 3 and 4.
  `
  CREATE TABLE web_access (
    workspace_id INTEGER PRIMARY KEY REFERENCES workspaces(id),
    always INTEGER NOT NULL CHECK (always IN (0, 1)),
    changed_at INTEGER NOT NULL,
    changed_by INTEGER REFERENCES people(id)
  ) STRICT;
  CREATE TABLE audit_v6 (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('person', 'admin', 'run', 'system')),
    actor_person_id INTEGER REFERENCES people(id),
    action TEXT NOT NULL CHECK (action IN (${sqlList(ACTIONS_V6)})),
    workspace_id INTEGER REFERENCES workspaces(id),
    subject_person_id INTEGER REFERENCES people(id),
    name_ref BLOB,
    sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
    size INTEGER,
    role TEXT CHECK (role IS NULL OR role IN (${sqlList(ROLES)})),
    ok INTEGER NOT NULL DEFAULT 1 CHECK (ok IN (0, 1)),
    tokens_in INTEGER CHECK (tokens_in IS NULL OR tokens_in >= 0),
    tokens_out INTEGER CHECK (tokens_out IS NULL OR tokens_out >= 0),
    cost_micro_usd INTEGER CHECK (cost_micro_usd IS NULL OR cost_micro_usd >= 0)
  ) STRICT;
  INSERT INTO audit_v6 SELECT * FROM audit;
  DROP TABLE audit;
  ALTER TABLE audit_v6 RENAME TO audit;
  CREATE INDEX audit_workspace ON audit(workspace_id, at);
  `,
  // 7: Fallback to a hosted open model, per project (frontdesk/hosted.mjs): off by default, its own
  // ceiling if the admin set one. "When a request looks like a stretch" (stretch: suggest, the
  // default; handover; never) and where a handover goes (stretch_to: hosted or claude), replacing
  // claude_auto (its "when Ola gets stuck" and "always" become a handover to Claude). One-time
  // grants ("Just this once"): a row per run in fallback_once, so the gateway's grants files, written
  // from the database alone by the server and the admin CLI, keep them while the run lasts. New
  // audit words, so the table is rebuilt for the CHECK, as in 2, 3, 4 and 6.
  `
  ALTER TABLE workspaces ADD COLUMN hosted_enabled INTEGER NOT NULL DEFAULT 0 CHECK (hosted_enabled IN (0, 1));
  ALTER TABLE workspaces ADD COLUMN hosted_cap_micro_usd INTEGER CHECK (hosted_cap_micro_usd IS NULL OR hosted_cap_micro_usd >= 0);
  ALTER TABLE workspaces ADD COLUMN stretch TEXT NOT NULL DEFAULT 'suggest' CHECK (stretch IN ('suggest', 'handover', 'never'));
  ALTER TABLE workspaces ADD COLUMN stretch_to TEXT NOT NULL DEFAULT 'hosted' CHECK (stretch_to IN ('hosted', 'claude'));
  UPDATE workspaces SET stretch = 'handover', stretch_to = 'claude' WHERE claude_auto IN ('stuck', 'always');
  CREATE TABLE fallback_once (
    id INTEGER PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
    engine TEXT NOT NULL CHECK (engine IN ('hosted', 'claude')),
    person_id INTEGER REFERENCES people(id),
    until INTEGER NOT NULL
  ) STRICT;
  CREATE TABLE audit_v7 (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('person', 'admin', 'run', 'system')),
    actor_person_id INTEGER REFERENCES people(id),
    action TEXT NOT NULL CHECK (action IN (${sqlList(ACTIONS_V7)})),
    workspace_id INTEGER REFERENCES workspaces(id),
    subject_person_id INTEGER REFERENCES people(id),
    name_ref BLOB,
    sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
    size INTEGER,
    role TEXT CHECK (role IS NULL OR role IN (${sqlList(ROLES)})),
    ok INTEGER NOT NULL DEFAULT 1 CHECK (ok IN (0, 1)),
    tokens_in INTEGER CHECK (tokens_in IS NULL OR tokens_in >= 0),
    tokens_out INTEGER CHECK (tokens_out IS NULL OR tokens_out >= 0),
    cost_micro_usd INTEGER CHECK (cost_micro_usd IS NULL OR cost_micro_usd >= 0)
  ) STRICT;
  INSERT INTO audit_v7 SELECT id, at, actor_kind, actor_person_id, action, workspace_id, subject_person_id, name_ref, sha256, size, role, ok, tokens_in, tokens_out, cost_micro_usd FROM audit;
  DROP TABLE audit;
  ALTER TABLE audit_v7 RENAME TO audit;
  CREATE INDEX audit_workspace ON audit(workspace_id, at);
  `,
  // 8: batch jobs (frontdesk/jobs.mjs). One row per job a person started: its id in the project's
  // own database (12 hex), its state, the model, the budget approved (tokens), who, when. Nothing
  // of what it asks or reads: that is content, and stays in the project's VM. New audit words, so
  // the table is rebuilt for the CHECK, as in 2, 3, 4, 6 and 7.
  `
  CREATE TABLE batch_jobs (
    id INTEGER PRIMARY KEY,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
    job TEXT NOT NULL CHECK (length(job) = 12),
    state TEXT NOT NULL CHECK (state IN ('trial', 'trial_done', 'running', 'paused', 'done', 'cancelled')),
    stage TEXT NOT NULL DEFAULT 'trial' CHECK (stage IN ('trial', 'full')),
    model TEXT NOT NULL CHECK (model IN ('general', 'hosted', 'claude')),
    budget INTEGER NOT NULL CHECK (budget > 0),
    started_by INTEGER REFERENCES people(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (workspace_id, job)
  ) STRICT;
  CREATE TABLE audit_v8 (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('person', 'admin', 'run', 'system')),
    actor_person_id INTEGER REFERENCES people(id),
    action TEXT NOT NULL CHECK (action IN (${sqlList(ACTIONS_V8)})),
    workspace_id INTEGER REFERENCES workspaces(id),
    subject_person_id INTEGER REFERENCES people(id),
    name_ref BLOB,
    sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
    size INTEGER,
    role TEXT CHECK (role IS NULL OR role IN (${sqlList(ROLES)})),
    ok INTEGER NOT NULL DEFAULT 1 CHECK (ok IN (0, 1)),
    tokens_in INTEGER CHECK (tokens_in IS NULL OR tokens_in >= 0),
    tokens_out INTEGER CHECK (tokens_out IS NULL OR tokens_out >= 0),
    cost_micro_usd INTEGER CHECK (cost_micro_usd IS NULL OR cost_micro_usd >= 0)
  ) STRICT;
  INSERT INTO audit_v8 SELECT id, at, actor_kind, actor_person_id, action, workspace_id, subject_person_id, name_ref, sha256, size, role, ok, tokens_in, tokens_out, cost_micro_usd FROM audit;
  DROP TABLE audit;
  ALTER TABLE audit_v8 RENAME TO audit;
  CREATE INDEX audit_workspace ON audit(workspace_id, at);
  `,
  // 9: "Compare with Claude" (frontdesk/compare.mjs). Per project: the real-task switch (off), when
  // made-up copies are made (ask: only when the owner asks; daily: a few each day, on their own),
  // how many a day, and the month's budget if the owner set one. One row per comparison: ids,
  // fixed words and numbers only (the copy, the results and the judged sentence live in files under
  // $OLA_HOME/compare for a made-up copy, and in the project's VM for the real task). The scratch
  // VMs' one-time gateway grants (compare_scratch), so the grants files, written from the database
  // alone, carry them. New audit words: the table is rebuilt for the CHECK, as in 2, 3, 4, 6, 7, 8.
  `
  ALTER TABLE workspaces ADD COLUMN compare_real INTEGER NOT NULL DEFAULT 0 CHECK (compare_real IN (0, 1));
  ALTER TABLE workspaces ADD COLUMN compare_auto TEXT NOT NULL DEFAULT 'ask' CHECK (compare_auto IN ('ask', 'daily'));
  ALTER TABLE workspaces ADD COLUMN compare_per_day INTEGER NOT NULL DEFAULT 2 CHECK (compare_per_day BETWEEN 1 AND 10);
  ALTER TABLE workspaces ADD COLUMN compare_cap_micro_usd INTEGER CHECK (compare_cap_micro_usd IS NULL OR compare_cap_micro_usd >= 0);
  CREATE TABLE comparisons (
    id TEXT PRIMARY KEY CHECK (length(id) = 12),
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
    person_id INTEGER REFERENCES people(id),
    session TEXT NOT NULL CHECK (length(session) BETWEEN 1 AND 80),
    message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 80),
    mode TEXT NOT NULL CHECK (mode IN ('twin', 'real')),
    trigger TEXT NOT NULL CHECK (trigger IN ('asked', 'sampled')),
    state TEXT NOT NULL CHECK (state IN ('making', 'held', 'refused', 'ready', 'running', 'done', 'failed', 'declined')),
    verdict TEXT CHECK (verdict IS NULL OR verdict IN ('clean', 'unsure', 'leak')),
    released_by INTEGER REFERENCES people(id),
    twin_sha256 TEXT CHECK (twin_sha256 IS NULL OR length(twin_sha256) = 64),
    kind TEXT CHECK (kind IS NULL OR kind IN (${sqlList(COMPARE_KINDS)})),
    judged TEXT CHECK (judged IS NULL OR judged IN ('ola', 'claude', 'same', 'unsure')),
    outcome TEXT CHECK (outcome IS NULL OR outcome IN ('both_right', 'claude_better', 'ola_better', 'both_wrong', 'unsure')),
    label TEXT CHECK (label IS NULL OR label IN (${sqlList(EVAL_LABELS)})),
    ola_model TEXT CHECK (ola_model IS NULL OR length(ola_model) <= 60),
    claude_model TEXT CHECK (claude_model IS NULL OR length(claude_model) <= 60),
    ola_passed INTEGER, ola_total INTEGER, claude_passed INTEGER, claude_total INTEGER,
    ola_tokens INTEGER, ola_ms INTEGER, claude_tokens INTEGER, claude_ms INTEGER, judge_tokens INTEGER,
    cost_micro_usd INTEGER CHECK (cost_micro_usd IS NULL OR cost_micro_usd >= 0),
    candidate INTEGER NOT NULL DEFAULT 0 CHECK (candidate IN (0, 1)),
    created_at INTEGER NOT NULL,
    finished_at INTEGER
  ) STRICT;
  CREATE INDEX comparisons_workspace ON comparisons(workspace_id, created_at);
  CREATE TABLE compare_scratch (
    slug TEXT PRIMARY KEY CHECK (length(slug) BETWEEN 3 AND 32 AND slug NOT GLOB '*[^a-z0-9-]*'),
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
    engine TEXT NOT NULL CHECK (engine IN ('claude', 'hosted')),
    mode TEXT NOT NULL CHECK (mode IN ('oauth', 'api_key')),
    cap_micro_usd INTEGER NOT NULL CHECK (cap_micro_usd >= 0),
    cap_tokens INTEGER NOT NULL CHECK (cap_tokens >= 0),
    until INTEGER NOT NULL
  ) STRICT;
  CREATE TABLE audit_v9 (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('person', 'admin', 'run', 'system')),
    actor_person_id INTEGER REFERENCES people(id),
    action TEXT NOT NULL CHECK (action IN (${sqlList(ACTIONS_V9)})),
    workspace_id INTEGER REFERENCES workspaces(id),
    subject_person_id INTEGER REFERENCES people(id),
    name_ref BLOB,
    sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
    size INTEGER,
    role TEXT CHECK (role IS NULL OR role IN (${sqlList(ROLES)})),
    ok INTEGER NOT NULL DEFAULT 1 CHECK (ok IN (0, 1)),
    tokens_in INTEGER CHECK (tokens_in IS NULL OR tokens_in >= 0),
    tokens_out INTEGER CHECK (tokens_out IS NULL OR tokens_out >= 0),
    cost_micro_usd INTEGER CHECK (cost_micro_usd IS NULL OR cost_micro_usd >= 0)
  ) STRICT;
  INSERT INTO audit_v9 SELECT id, at, actor_kind, actor_person_id, action, workspace_id, subject_person_id, name_ref, sha256, size, role, ok, tokens_in, tokens_out, cost_micro_usd FROM audit;
  DROP TABLE audit;
  ALTER TABLE audit_v9 RENAME TO audit;
  CREATE INDEX audit_workspace ON audit(workspace_id, at);
  `,
  // 10: review 5 follow-up. A batch job's runner key (jobs.mjs): the sha256 of the key the job's
  // runner made for itself in the VM, so the gateway's job grant (and the Claude or hosted grant of a
  // job on those models) is the runner's alone. fallback_once now holds a lease for every Claude and
  // hosted run the front desk starts, not only "Just this once": the grants files list a project
  // only while one of its runs goes on (claude.mjs, hosted.mjs).
  `
  ALTER TABLE batch_jobs ADD COLUMN runner_key_sha256 TEXT CHECK (runner_key_sha256 IS NULL OR (length(runner_key_sha256) = 64 AND runner_key_sha256 NOT GLOB '*[^0-9a-f]*'));
  `,
  // 11: devices (frontdesk/devices.mjs): the Mac app or the command line, signed in to a person's
  // account through the browser. Who may (devices_allowed, off; admins always may), and one row per
  // device: its name as the app gave it (shown back to the person; no other text from a person is
  // kept), mac or cli, the sha256 of its token (never the token), when it was made, last used, when
  // it ends (180 days) and when it was revoked. No IP, no user agent. New audit words: the table is
  // rebuilt for the CHECK, as in 2, 3, 4, 6, 7, 8 and 9.
  `
  ALTER TABLE people ADD COLUMN devices_allowed INTEGER NOT NULL DEFAULT 0 CHECK (devices_allowed IN (0, 1));
  CREATE TABLE devices (
    id INTEGER PRIMARY KEY,
    person_id INTEGER NOT NULL REFERENCES people(id),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    kind TEXT NOT NULL CHECK (kind IN ('mac', 'cli')),
    token_sha256 BLOB NOT NULL UNIQUE CHECK (length(token_sha256) = 32),
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
  ) STRICT;
  CREATE INDEX devices_person ON devices(person_id);
  CREATE TABLE audit_v11 (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('person', 'admin', 'run', 'system')),
    actor_person_id INTEGER REFERENCES people(id),
    action TEXT NOT NULL CHECK (action IN (${sqlList(ACTIONS_V11)})),
    workspace_id INTEGER REFERENCES workspaces(id),
    subject_person_id INTEGER REFERENCES people(id),
    name_ref BLOB,
    sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
    size INTEGER,
    role TEXT CHECK (role IS NULL OR role IN (${sqlList(ROLES)})),
    ok INTEGER NOT NULL DEFAULT 1 CHECK (ok IN (0, 1)),
    tokens_in INTEGER CHECK (tokens_in IS NULL OR tokens_in >= 0),
    tokens_out INTEGER CHECK (tokens_out IS NULL OR tokens_out >= 0),
    cost_micro_usd INTEGER CHECK (cost_micro_usd IS NULL OR cost_micro_usd >= 0)
  ) STRICT;
  INSERT INTO audit_v11 SELECT id, at, actor_kind, actor_person_id, action, workspace_id, subject_person_id, name_ref, sha256, size, role, ok, tokens_in, tokens_out, cost_micro_usd FROM audit;
  DROP TABLE audit;
  ALTER TABLE audit_v11 RENAME TO audit;
  CREATE INDEX audit_workspace ON audit(workspace_id, at);
  `,
  // 12: a normal sign-in with a password, the passkey optional (2026-11-17). people: the password's
  // scrypt hash (passwords.mjs; never the password), when it was set, whether the person asks for
  // their passkey too, and their own Macs' weekly allowance (NULL: the front desk's default) and
  // whether those may use the hosted open model, with its monthly ceiling. password_links: a one-time
  // link the admin prints to set a password (sha256 of the token, as invitations). New audit words:
  // the table is rebuilt for the CHECK, as in 2, 3, 4, 6, 7, 8, 9 and 11.
  `
  ALTER TABLE people ADD COLUMN password_hash TEXT CHECK (password_hash IS NULL OR (password_hash GLOB 'scrypt$*' AND length(password_hash) <= 300));
  ALTER TABLE people ADD COLUMN password_set_at INTEGER;
  ALTER TABLE people ADD COLUMN require_passkey INTEGER NOT NULL DEFAULT 0 CHECK (require_passkey IN (0, 1));
  ALTER TABLE people ADD COLUMN app_weekly_tokens INTEGER CHECK (app_weekly_tokens IS NULL OR app_weekly_tokens >= 0);
  ALTER TABLE people ADD COLUMN app_hosted INTEGER NOT NULL DEFAULT 0 CHECK (app_hosted IN (0, 1));
  ALTER TABLE people ADD COLUMN app_hosted_cap_micro_usd INTEGER CHECK (app_hosted_cap_micro_usd IS NULL OR app_hosted_cap_micro_usd >= 0);
  CREATE TABLE password_links (
    id INTEGER PRIMARY KEY,
    person_id INTEGER NOT NULL REFERENCES people(id),
    token_hash BLOB NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    voided_at INTEGER
  ) STRICT;
  CREATE TABLE audit_v12 (
    id INTEGER PRIMARY KEY,
    at INTEGER NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('person', 'admin', 'run', 'system')),
    actor_person_id INTEGER REFERENCES people(id),
    action TEXT NOT NULL CHECK (action IN (${sqlList(ACTIONS_V12)})),
    workspace_id INTEGER REFERENCES workspaces(id),
    subject_person_id INTEGER REFERENCES people(id),
    name_ref BLOB,
    sha256 TEXT CHECK (sha256 IS NULL OR length(sha256) = 64),
    size INTEGER,
    role TEXT CHECK (role IS NULL OR role IN (${sqlList(ROLES)})),
    ok INTEGER NOT NULL DEFAULT 1 CHECK (ok IN (0, 1)),
    tokens_in INTEGER CHECK (tokens_in IS NULL OR tokens_in >= 0),
    tokens_out INTEGER CHECK (tokens_out IS NULL OR tokens_out >= 0),
    cost_micro_usd INTEGER CHECK (cost_micro_usd IS NULL OR cost_micro_usd >= 0)
  ) STRICT;
  INSERT INTO audit_v12 SELECT id, at, actor_kind, actor_person_id, action, workspace_id, subject_person_id, name_ref, sha256, size, role, ok, tokens_in, tokens_out, cost_micro_usd FROM audit;
  DROP TABLE audit;
  ALTER TABLE audit_v12 RENAME TO audit;
  CREATE INDEX audit_workspace ON audit(workspace_id, at);
  `,
  // Kept conversations (2026-11-18, OLA-159). Bart: "store your conversations on ola.cx to help us
  // improve our systems", a setting that is off by default. A person who turned it on sends each
  // finished turn from their app; they can see how many are kept and delete them all (devices.mjs).
  // `switched_from`: the same person had another engine try before this one (OLA-157: a switch to
  // Claude after Ola's own model means the first result was not good enough).
  `
  CREATE TABLE kept_turns (
    id INTEGER PRIMARY KEY,
    person_id INTEGER NOT NULL REFERENCES people(id),
    device_id TEXT,
    at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    product TEXT NOT NULL CHECK (product IN ('mac', 'iphone', 'cli', 'web')),
    runtime TEXT NOT NULL CHECK (runtime IN ('local', 'cloud')),
    app TEXT,
    session TEXT NOT NULL,
    session_title TEXT,
    turn TEXT NOT NULL,
    engine TEXT NOT NULL CHECK (engine IN ('ola', 'hosted', 'claude')),
    model TEXT,
    status TEXT NOT NULL CHECK (status IN ('done', 'failed', 'stopped')),
    seconds INTEGER,
    request TEXT NOT NULL,
    answer TEXT NOT NULL,
    steps TEXT NOT NULL,
    switched_from TEXT CHECK (switched_from IS NULL OR switched_from IN ('ola', 'hosted', 'claude')),
    UNIQUE (person_id, session, turn)
  ) STRICT;
  CREATE INDEX kept_turns_person ON kept_turns(person_id, at);
  `,
]

/** Opens (and creates, and migrates) the platform database in `dir`. */
export function openDb(dir) {
  process.umask(0o077)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodSync(dir, 0o700)
  const file = path.join(dir, 'platform.db')
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON;')
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, at INTEGER NOT NULL) STRICT')
  const have = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version))
  MIGRATIONS.forEach((sql, i) => {
    const v = i + 1
    if (have.has(v)) return
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (version, at) VALUES (?, ?)').run(v, Date.now())
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  })
  for (const f of [file, `${file}-wal`, `${file}-shm`]) if (existsSync(f)) chmodSync(f, 0o600)
  return db
}

/**
 * The front desk's own key (32 random bytes, mode 600, beside the database, never in it). Sub-keys:
 * `names` for the keyed hash of file names, `csrf` for each session's CSRF token.
 */
export function loadKeys(dir) {
  const file = path.join(dir, 'frontdesk.key')
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('hex') + '\n', { mode: 0o600, flag: 'wx' })
  chmodSync(file, 0o600)
  const root = Buffer.from(readFileSync(file, 'utf8').trim(), 'hex')
  if (root.length !== 32) throw new Error('frontdesk.key is not 32 bytes of hex')
  const sub = (label) => createHmac('sha256', root).update(label).digest()
  return { names: sub('ola names v1'), csrf: sub('ola csrf v1'), known: sub('ola known device v1') }
}

/** The keyed hash of a file name within one workspace. */
export const nameRef = (keys, workspaceId, name) => createHmac('sha256', keys.names).update(`${workspaceId}\0${name}`).digest()

export function audit(db, row) {
  if (!ACTIONS.includes(row.action)) throw new Error(`unknown audit action ${row.action}`)
  db.prepare(
    `INSERT INTO audit (at, actor_kind, actor_person_id, action, workspace_id, subject_person_id, name_ref, sha256, size, role, ok, tokens_in, tokens_out, cost_micro_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(Date.now(), row.actorKind ?? 'person', row.actor ?? null, row.action, row.workspace ?? null, row.subject ?? null, row.nameRef ?? null, row.sha256 ?? null, row.size ?? null, row.role ?? null, row.ok === false ? 0 : 1, row.tokensIn ?? null, row.tokensOut ?? null, row.costMicroUsd ?? null)
}

export const today = () => new Date().toISOString().slice(0, 10)
