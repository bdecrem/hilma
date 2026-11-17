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
/** What the audit log may say. A row with any other action is refused by the table itself. */
export const ACTIONS = [
  ...ACTIONS_V3,
  // migration 4: a page opened from the project ("Open"), and Fallback to Claude
  'page_opened', 'claude_enabled', 'claude_disabled', 'claude_used',
]

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
    action TEXT NOT NULL CHECK (action IN (${sqlList(ACTIONS)})),
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
  return { names: sub('ola names v1'), csrf: sub('ola csrf v1') }
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
