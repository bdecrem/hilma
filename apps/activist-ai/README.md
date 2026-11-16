# activist-ai

A private agent service: Claude-Code-style work (an agent that reads your files, runs code and
writes results in a workspace) on open models, on one machine we own, for a few invited people.
Started 2026-11-15. The plan, the promise and its limits are in the private notes
(`apps/venture/private/ACTIVIST-AI-PLAN-2026-11-15.md`); this folder is the code.

## The parts

| Part | What it is | State |
|---|---|---|
| **Agent** | [opencode](https://github.com/anomalyco/opencode) 2.3.0 (MIT), one copy per person's workspace | runs a real task end to end, from the command line and in server mode (see the spike) |
| **Model gateway** | `gateway/server.mjs`: the one address a workspace may reach. Holds the model server's address and key, checks who is calling, caps size, concurrency, time and weekly tokens, keeps one line per request and never any content | built and tested (`gateway/test.mjs`), used by the spike; see [The gateway](#the-gateway) |
| **Model** | an OpenAI-compatible server. On the Mac Studio (arrives Nov 30 to Dec 3, 2026): a local MLX server. Until then: Together.ai, made-up data only | stand-in works with GLM-5.3-Flash |
| **Workspace** | `workspace/`: one sealed Linux VM per workspace (Apple `container` 1.7.1) with no network at all; one socket leads to the gateway and nowhere else | built and proven on the mini (`workspace/check.mjs`, 55 checks); see [The workspace](#the-workspace) |
| **Front desk and page** | `frontdesk/`: the one service a browser talks to. Passkey sign-in by invitation, the platform database (one SQLite file), roles, the audit log, files and the opencode door to each sealed workspace; serves `web/` (look A) from the same origin | built and proven on the mini (`frontdesk/check.mjs`); see [The front desk](#the-front-desk) |
| **Way in** | Tailscale; nothing on the public internet | not built |
| **Landing page** | `site/`: Ola's front door, a static page built into `public/ola-site/` for ola.cx, with no third-party requests (`site/check.mjs` proves it); see `site/README.md` | built, not live |

## The spike: does the core loop work?

`spike/run-once.sh` makes a throwaway folder with a made-up, deliberately messy volunteer survey
(`make-survey.py`, right answers known), gives opencode an empty home folder of its own and a config
that denies web access and anything outside the folder, asks it to clean the file and report totals
(`task-survey.txt`), and checks the result against the known answers (`check-survey.py`, 16 checks).

```bash
npm install                                   # opencode 2.3.0 and its client, into this folder
# the gateway, pointed at the stand-in (the key stays in the gateway's environment)
UPSTREAM_BASE_URL=https://api.together.xyz/v1 UPSTREAM_API_KEY=$TOGETHER_API_KEY \
  GATEWAY_TOKENS=spike:$(openssl rand -hex 16 | tee /tmp/gw-token) \
  GATEWAY_MODELS=general=zai-org/GLM-5.3-Flash node gateway/server.mjs &
BOX_API_KEY=$(cat /tmp/gw-token) SPIKE_TAIL=30 spike/run-once.sh glm general http://127.0.0.1:4180/v1
```

`spike/serve-drive.mjs` runs the same task the way our own page will: `opencode serve` headless in the
workspace, and the script as the page, over HTTP with `@opencode/client` (create a session, send the
request, follow the event stream, wait for the end).

```bash
BOX_API_KEY=$(cat /tmp/gw-token) SPIKE_TAIL=30 node spike/serve-drive.mjs glm general
```

Measured 2026-11-15 on the iMac, through the gateway:

- **Server mode, driven by our own code: 16 of 16 checks, 31 seconds** (GLM-5.3-Flash, one run). The
  server came up in 0.4 seconds and answered 401 with no credentials, 401 with a wrong password and
  200 with ours: opencode 2 wants Basic auth (user `opencode`, the password from `OPENCODE_PASSWORD`),
  so the front desk makes one password per workspace. The event stream carries what a page needs:
  steps, reasoning, each tool call and its result, text as it is written, and the end of the run.
- **opencode itself reaches out.** The event stream showed `models-dev.refreshed`: it fetches a model
  catalog from models.dev. Update checks are off in our config (`"update": "disable"`). In a sealed
  workspace neither has a route; that it still works there is to be tested when the workspaces exist.

- **GLM-5.3-Flash on Together.ai: 16 of 16 checks, 25 seconds, 6 model requests, 44,681 tokens in and
  5,233 out** (about one cent at Together's listed price). One run; not a reliability figure.
- **gpt-oss-120b on Together.ai does not work as an agent model.** With opencode's real request (a
  9,000-character system prompt, ten tools) it failed 59 of 61 tries (58 times
  `500 harmony_parsing_failed`, one timeout), whatever we changed: fewer tools, a shorter prompt,
  either token-limit field, one tool at a time, low reasoning. With a toy two-tool request it did call
  the tools, and wrote invented tool results beside the calls in all four samples. Its own server
  rejects the model's output; nothing in the request fixes that. How gpt-oss-120b behaves under a
  local MLX server is a separate question that only the Mac can answer.
- Of twelve Mac-sized models probed on Together, two answer without a paid dedicated endpoint:
  gpt-oss-120b and the small Qwen3.5-9B. GLM-5.3-Flash, DeepSeek-V4.1-Flash and MiniMax-M3.1-Flash
  handled opencode's request cleanly (3 of 3 each), but whether any of them fits a 128 GB Mac is not
  established. So **Together stands in for the plumbing, not for the model**: what we learn there
  about model quality does not carry over.
- `Qwen/Qwen3.8-Flash` answered `403 third_party_data_sharing_blocked`: some models on Together are
  served by third parties. One more reason only made-up data goes there.

## The gateway

`gateway/server.mjs`, one file, Node 22.13 or later, no dependencies. Every caller is treated as
hostile: a workspace's agent can be prompt-injected, and its shell can send anything to port 4180.
Tests: `node --test gateway/test.mjs` (13 tests, about 13 seconds; each starts the real server
against a fake model server, so config refusal, restarts and timeouts are tested on the program
that runs).

**The reply is rebuilt, not relayed.** A successful reply is reconstructed from a fixed allowlist
(`id`, `object`, `created`, `model` as the gateway's own name, `choices` with `role`/`content`/
`tool_calls`/`finish_reason`, and `usage` trimmed to `prompt_tokens`/`completion_tokens`/
`total_tokens`) — so no field the model server invents reaches a caller, including
`prompt_tokens_details.cached_tokens`, a prompt-cache hit count that would otherwise be a side
channel between callers. An upstream **error** is never relayed either: the caller gets one fixed
message per status class, and an upstream 401/403 is hidden as a 502 (its text can quote the
gateway's own `Authorization` header, i.e. the model key). As a last layer the configured upstream
key is scrubbed from anything written to a reply or the log.

**Routes.** `POST /v1/chat/completions` (streamed or not), `GET /v1/models` (the names in
`GATEWAY_MODELS`), `GET /v1/usage` (with a caller token: that caller's week, e.g.
`"fraction_used": 0.38`; with `GATEWAY_USAGE_TOKEN`: every caller plus requests in flight and
waiting. That token can read usage and nothing else, so the web app never needs a caller token).

**What it enforces, in the order a request meets it:**

| Limit | Setting | Default | What the caller gets |
|---|---|---|---|
| Who | `GATEWAY_TOKENS` `name:token,…` (token 24+ printable chars) | required | 401 |
| Body size | `GATEWAY_MAX_BODY_BYTES` | 4 MiB | 413, from `Content-Length` before a byte is read, or the moment a chunked body passes the cap; the connection is closed |
| Bodies in memory at once, all callers | `GATEWAY_MAX_TOTAL_BODY_BYTES` | 32 MiB | 503 `overloaded_error`, `Retry-After: 5`; bounds `maxBody × connections` so slow senders cannot pin the process's memory |
| Reading the request | `GATEWAY_READ_TIMEOUT_MS` (headers: 10 s) | 30 s | 408 from Node (slow senders) |
| Model name | `GATEWAY_MODELS` `general=<upstream id>,fast=…,code=…` | required | 400 for any other name; the caller's string never goes upstream, and only known request fields are passed on (`n` and `user` are dropped) |
| Weekly tokens | `GATEWAY_WEEKLY_TOKENS`, per-caller `GATEWAY_QUOTAS` `name=tokens,…` | 20,000,000 | 429 `insufficient_quota`, `Retry-After` = seconds to Monday 00:00 UTC |
| In flight to the model server, all callers | `GATEWAY_MAX_INFLIGHT` | 4 | waits in its caller's queue |
| In flight, one caller | `GATEWAY_MAX_INFLIGHT_PER_CALLER` | 2 | waits in its caller's queue |
| Waiting, one caller | `GATEWAY_MAX_QUEUED_PER_CALLER` | 8 | 429 `rate_limit_error`, `Retry-After: 5` |
| Longest wait for a slot | `GATEWAY_MAX_QUEUE_WAIT_MS` | 120 s | 503 `overloaded_error`, `Retry-After: 10` |
| Connect (TCP and TLS) | `GATEWAY_CONNECT_TIMEOUT_MS` | 5 s | retried; 504 after three |
| First byte (response headers) | `GATEWAY_FIRST_BYTE_TIMEOUT_MS` | 300 s | 504, not retried |
| Total, from getting a slot, all tries | `GATEWAY_TOTAL_TIMEOUT_MS` | 600 s | 504 |
| Reply size from the model server | `GATEWAY_MAX_REPLY_BYTES` | 16 MiB | 502 |

Other settings: `UPSTREAM_BASE_URL` and `UPSTREAM_API_KEY` (required; plain http only to
127.0.0.1), `GATEWAY_HOST` (127.0.0.1), `GATEWAY_PORT` (4180), `GATEWAY_DB` (the usage file,
`~/.local/state/ola-gateway/usage.db`, mode 600), `TEXT_WITH_CALLS` (`drop` or `keep`). The
gateway **refuses to start** on any bad value, on a duplicate name or token, and on an unknown
`GATEWAY_*` variable (a typo would otherwise silently fall back to a default). Its complaints
name the setting and the entry number, never the value.

**The queue is fair.** Each caller has its own line. When a slot frees, the lines are served
round-robin, one request per caller per turn: a caller with ten waiting does not starve one with
a single request. A caller who disconnects leaves the queue, or, if its request is already
upstream, the upstream socket is destroyed, which is how the model server learns to stop; either
way the slot frees at once.

**The quota.** Prompt plus completion tokens from the model server's `usage`, counted on every
try (a reply rejected and retried was still work), per caller per week starting Monday 00:00
UTC, in SQLite via `node:sqlite`: it ships with Node, so there is no native addon to build and no
npm package in the process that holds the model key. A restart forgets nothing. The check is made
before a request is queued **and again when a queued request is granted its slot and before every
retry**, counting the tokens already committed plus what the request in hand has spent on earlier
tries — so a burst cannot run its whole queue past the limit, and a single request cannot keep
retrying once its own tries have crossed it. A model server that reports no usage is **charged an
estimate from the bytes on the wire** (~4 bytes per token), logged with `"estimated":"bytes"`, so a
silent server is never free.

**Reading the log.** stdout, one JSON line per request, plus one `"event":"start"` line with
the limits in force:

```json
{"t":"2026-11-16T18:06:24.357Z","caller":"spike","route":"chat","model":"general","status":200,"why":null,"tries":1,"tokens_in":6393,"tokens_out":4875,"estimated":null,"wait_ms":0,"ms":23180}
```

`caller` is a name from `GATEWAY_TOKENS` (`-` if unknown, `usage` for the usage token); `route`
is `chat`, `models`, `usage` or `other` (never the path); `model` is a gateway name or `-`;
`status` 499 means the caller went away; `why` (on failures) is one of the gateway's own fixed
sentences, at most carrying the upstream's status number, never the model server's error text;
`wait_ms` is time in the queue; `ms` is the whole request. Every field is a number, a name
checked at start, or a fixed string, so nothing a caller or the model server sends can reach the
log; the test sends newlines in the model name, the path, the error text and the reply, and
checks every line. Errors inside the gateway print only the error's class to stderr: V8's JSON
errors quote their input, and that input is content.

**Measured 2026-11-16** through this gateway with its defaults: the survey spike on GLM-5.3-Flash
(Together), 16 of 16 checks, 31 seconds, 7 model requests, 57,897 tokens in and 5,461 out, no
retries, no queue wait. The request-field allowlist did not change opencode's behavior.

**Not done yet:** per-workspace model grants (every token sees every model; that needs the
platform DB), tokens from the DB instead of the environment, a daily (rather than weekly) quota,
and per-request output caps (`max_tokens` is passed on as sent).

## The workspace

`workspace/`: the image (`Containerfile`), the CLI (`ws.mjs`), the door (`door.mjs`), the desk
(`desk.mjs`) and the proofs (`check.mjs`). It runs on the machine that hosts the VMs, as the account that runs
`container system start`. Node 22 or later. Nothing in it needs root.

**The seal: no network, one socket.** Each workspace VM runs with `--network none`. Its only
interface is loopback: no route to the internet, the host, the LAN, the tailnet or another
workspace. It has exactly two ways in or out:

- **Out, the door.** `ws.mjs` mounts one host socket into the VM (`~/.ola/ws/<id>/gateway.sock`
  at `/ola/gw/gateway.sock`). Its listener, `door.mjs`, pipes every connection to
  `127.0.0.1:4180`, the gateway, and to nothing else: the destination is fixed in the door, not
  chosen by what the VM sends (a proxy request, a `Host:` header or a `CONNECT` still lands on
  the gateway, which wants a token). Inside, `ola-init` bridges `127.0.0.1:4180` to the socket,
  so opencode's config just says `http://127.0.0.1:4180/v1`.
- **In, the desk.** `opencode serve` listens on 127.0.0.1:4096 inside. On the host, `desk.mjs`
  listens on `~/.ola/ws/<id>/opencode.sock` (mode 600) and turns each connection into a
  `container exec -i ola-<id> socat STDIO TCP:127.0.0.1:4096` (about 60 ms to connect, at most 16
  at once). The front desk talks to it with the workspace's Basic-auth password. Nothing is
  published with `--publish-socket`: Apple's in-VM init looks for a published socket on the root
  file system as it sits on disk, so it would need a writable root (see the read-only root below).

**Why not a host-only network and pf.** That was the plan (`--internal` networks plus a pf anchor).
Measured on the mini: an `--internal` network does block the internet, but the VM reached the
host's sshd at the network's gateway address (10.77.1.1:22), and so it would reach every host
service that listens on all addresses. On the mini that includes BlueBubbles (:1234, the iMessage
bridge), the Almanac and about twenty more. Closing that needs a pf anchor, which needs root, and
it would make the seal depend on a rule set staying right as services come and go. With no
network there is nothing to filter. The seal does not need pf, sudo or any setting on the host.
(A machine-wide pf outbound allowlist is still planned for the Studio itself, arch step 11; that
is about the host, not the workspaces.)

**What a workspace is.** Container `ola-<id>`, volume `ola-<id>` at `/work` (ext4, sized at
creation), and `~/.ola/ws/<id>/` (mode 700) with `secrets.env` (600: the opencode password and
the gateway token, both generated; they reach the VM by `--env-file`, never a command line, and
are never printed), the door's and the desk's pid and log, and the two sockets. The runtime's own
folders for the workspace (the container's config, which holds its environment, and the volume
image) are set to mode 700 at `create`. `~/.ola/gateway-tokens` (600)
holds the `GATEWAY_TOKENS` line for the gateway: restart the gateway after a `create` or
`destroy`. Everything opencode keeps (its session database, logs, caches) is under
`/work/.ola`, so `files` shows it and `destroy` removes it; the image's root holds nothing of the
customer's. **The image's root is read-only** (`--read-only`): `/work` and the `/tmp` tmpfs (in the
VM's memory, so bounded by it) are the only places anything can be written. Before the review of
2026-11-16 the root was writable, and a 1 GiB workspace wrote 1.5 GiB into `/var/tmp`: the root is a
512 GiB sparse image on the host, outside the volume's limit, invisible to `files`, and kept across
`stop`. The agent runs as `work` (uid 1000) with no capabilities (`--cap-drop ALL`), no sudo, and no
setuid or setgid program in the image (Debian's `su`, `passwd`, `mount` and the rest are stripped). Image: Debian bookworm-slim pinned by digest, opencode 2.3.0 checked
against npm's sha512, python3, socat, nothing else (no curl, no CA bundle, no ssh). Image tag `ola-workspace:2.3.0-3` (2.3.0-3 added `ola-get` and `ola-rm` for the front desk's downloads and deletes, and a file's mtime in `ola-files`).

```bash
node workspace/ws.mjs image                    # build ola-workspace:2.3.0-3 (about 25 s)
node workspace/ws.mjs create alice             # 4 CPUs, 6 GiB, 50 GiB: the ceilings
node workspace/ws.mjs create test --memory 1g --disk 1g --cpus 1   # lower only; higher is refused
node workspace/ws.mjs start alice              # opens the door, boots, waits for opencode
node workspace/ws.mjs upload alice survey.csv  # plain names; same name refused without --replace
node workspace/ws.mjs files alice              # size and sha256 of everything in /work
node workspace/ws.mjs status                   # state, memory used, volume on disk, network, door
node workspace/ws.mjs stop alice
node workspace/ws.mjs destroy alice            # asks for the id; --confirm alice for scripts
```

At most 4 workspaces run at once (`OLA_MAX_RUNNING` can only lower it). The two-runs-at-once
limit per workspace is the gateway's (`GATEWAY_MAX_INFLIGHT_PER_CALLER=2`).

**The proofs.** `node workspace/check.mjs` on the host (from `apps/activist-ai`, after `npm ci`).
It starts its own gateway on port 4181 with Together as the stand-in (the key is read from
`TOGETHER_API_KEY` or `~/Documents/code/hilma/.env.local` and never printed), creates three
workspaces under `~/.ola-check`, and checks from inside the VMs:

- the gateway answers with the workspace's token and refuses without one;
- the only interface is `lo`, with no IPv4 or IPv6 route; TCP to 1.1.1.1, 8.8.8.8 and Apple, to
  the vmnet host address, a host-only gateway, the mini's LAN and tailnet addresses (sshd,
  BlueBubbles, the gateway's own port) and a VM on the default network, IPv6, UDP and DNS all fail
  (`ENETUNREACH`); the only TCP listeners in the VM are our two bridges, by port scan and by the
  kernel's table;
- the other workspace has the same seal, and a file uploaded to one is nowhere on the other's
  disk; each VM mounts only its own volume and door and publishes only its own socket;
- the limits: cgroup `cpu.max` of 4 CPUs, 5.92 GiB `MemTotal`, a 49.2 GiB `/work`, uid 1000 with
  no capabilities; in a 1 GiB workspace touching 1.5 GiB is killed (exit 137) while 256 MiB fits
  and the workspace lives on; writing past a 1 GiB volume stops at 991 MiB with "No space left on
  device"; `create` refuses anything above the ceilings and `start` a third workspace when two may
  run;
- upload keeps size and sha256, refuses a repeat name and a dot name; with the door closed the VM
  cannot reach the gateway, and reopened (`start` on a running workspace) it can again;
- **the survey spike's task, run by opencode inside the VM through the door and the gateway:
  16 of 16 checks**;
- `destroy` leaves no container, no volume, no volume files under the container data root, no
  state folder, no gateway token and no door or desk process;
- from the review of 2026-11-16: no directory outside `/work` and `/tmp` takes a file, writing outside
  `/work` fails at once, nothing outside `/work` survives a stop, no setuid or setgid file is in the
  image, the runtime's folders are mode 700, every command refuses a malformed id (36 cases), upload
  refuses a host symlink and an option-like name on the host, and the door holds 32 of 48
  connections at once, refuses the rest and answers again after.

**Measured 2026-11-16 on the mini** (Mac mini, Apple M4, 16 GB, macOS 26.3.1, container 1.7.1),
three full runs of the check, the last 55 of 55:

- `create` 0.7 to 0.8 s (volume, ownership, container); `start` to opencode answering: **0.9 to 1.0 s**.
- After the review's changes (read-only root, the desk), against the gateway at 22191758: **64 of 64**.
- Memory: about **315 MiB** for an idle 6 GiB workspace, 216 to 231 MiB for an idle 1 GiB one,
  **465 MiB** after the survey task. The VM keeps what it has used until it stops (Apple's
  documented limit), which is why the front desk will stop idle workspaces.
- Disk: an empty 50 GiB volume takes **5.7 MiB** on the host (a sparse image); after the task,
  9 to 11 MiB.
- The task: 15 to 32 s, 7 to 9 model requests, 63,000 to 72,000 tokens (GLM-5.3-Flash on Together).
  opencode's catalog fetch from models.dev, seen on the iMac as `models-dev.refreshed`, never
  appears inside the VM, and opencode works without it.

**Things a reviewer should know.**

- The VM shows **5 vCPUs** for `--cpus 4`; the container's cgroup caps it at 4 CPUs of time (measured:
  5 spinning processes get 4.02, and `work` cannot write `cpu.max`). Only guest root could use the
  fifth; nothing in the workspace runs as root and no setuid program is left to get there.
- `container inspect ola-<id>` on the host shows the container's environment, the opencode
  password and gateway token included, and the runtime keeps it in `config.json` and
  `runtime-configuration.json` (mode 644) under its data root; `create` closes those folders to
  mode 700. `ws.mjs` never prints it; the host account already holds both secrets in
  `secrets.env`. Inside, the agent can read both from the environment: the password guards the
  host's way in, not anything from the agent, so whatever opencode answers the desk is the
  agent's word and the front desk must treat it as untrusted content.
- The gateway reads `GATEWAY_TOKENS` once at start: a destroyed workspace's token keeps working
  until the gateway restarts.
- `destroy` unlinks the volume image; on a disk without FileVault (the mini has it off) the blocks
  stay readable until reused. FileVault on the Studio is the at-rest protection.
- The door socket is mode 0666 because the VM sees the host file's mode with owner root, and
  `work` must connect. Its folder is mode 700, which is what keeps other host accounts out.
- `/proc/net/unix` inside lists a `/run/sockets/<uuid>.sock` that does not exist in the
  workspace's file system: it belongs to Apple's in-VM init (`vminitd`), which relays the
  mounted socket.
- `files` is what the VM says about its own disk (the host cannot read ext4). Its output is
  parsed strictly and anything out of shape is refused, but a compromised VM could misreport.
- If the door dies while a VM runs, the workspace loses the gateway until `ws.mjs start` reopens
  it. On the Studio the door becomes a launchd job.

**Not done yet:** start at boot and after an unattended reboot (Apple's `container` has no
restart policy); doors as launchd jobs; per-workspace tokens read by the gateway from the
platform DB instead of a restart; idle stop after 30 minutes; ssh into a workspace; backups of
the volumes; a test VM left up for the outside reviewer.

## The front desk

`frontdesk/`: the one service a customer's browser talks to. It replaces `web/dev.mjs` (which
stays, for working on the page with no sign-in) and keeps the page's three paths, so the page
changed only where it had to: a sign-in screen, the person's projects, a header on each request.

```
browser ── TLS (Caddy on the Studio, later) ──► front desk, 127.0.0.1 only (frontdesk/server.mjs)
                                                  │  web/dist: the page, CSP default-src 'none' + self
                                                  │  /api/auth/*   passkeys (invitation, sign-in), rate-limited
                                                  │  /api/me, /api/signout
                                                  │  /api/project, /api/files, /api/activity   ─┐ X-Ola-Workspace,
                                                  │  /oc/api/*  (web/server/proxy.mjs ALLOWED)  ─┘ membership per request
                                                  ├── platform.db (node:sqlite) + frontdesk.key (600, beside it)
                                                  ├── ws.mjs start / ola-put / ola-get / ola-rm / ola-files  (container exec)
                                                  └── ~/.ola/ws/<id>/opencode.sock (desk.mjs) + the workspace's opencode password
                                                         └─► sealed VM ─ door ─► gateway ─► model
```

**The platform database** (`frontdesk/db.mjs`, one SQLite file, migrations numbered in
`schema_migrations`, mode 600 in a 700 folder, WAL, `secure_delete`): `people` (handle, a
display name the admin types, status, admin flag, a random WebAuthn user id), `invitations`
(sha256 of the token, expiry, used), `passkeys` (credential id, public key, counter), `sessions`
(sha256 of the cookie, created, expires, last used, revoked; no IP, no user agent), `teams`,
`memberships` (owner, member, viewer), `workspaces` (the `ws.mjs` id), `uploads` and `audit`.
**No file name, file content or text from a person is stored.** A file is identified by
`name_ref`, an HMAC of its name under a key kept in `frontdesk.key` beside the database (so a
copy of the database alone cannot test names), plus its sha256 and size. The audit log's columns
are numbers, fixed words (a CHECK constraint lists every action), keyed hashes and sha256s:
`person_added`, `invited`, `passkey_registered`, `signed_in`, `sign_in_refused`, `signed_out`,
`sessions_revoked`, `person_suspended`, `workspace_created`, `member_added`, `member_removed`,
`role_changed`, `file_uploaded`, `file_downloaded`, `file_deleted`, `run_started`,
`file_read_by_run`, `shown_to_cloud_agent`. `GET /api/activity` shows a workspace's members its
own log, with names matched back from the files still there.

**Sign-in: passkeys only, by invitation** (`frontdesk/auth.mjs`, `@simplewebauthn/server`
14.0.3, pinned). `admin.mjs invite <handle>` prints a single-use link that expires (72 h by
default); its token is in the fragment (`/#/invite/<token>`), so it is in no request line or
Referer; the page posts it. Registration requires a resident key and user verification
(Face ID, Touch ID, Windows Hello, a PIN), attestation none, ES256 or RS256. The invitation is
spent in the same transaction that stores the passkey. Sign-in uses discoverable credentials, so
the page asks for nothing but the passkey; the returned user handle must match the passkey's
owner, and the signature counter is kept. A ceremony (challenge) lives 5 minutes in memory and
is good once, right or wrong. No passwords, no email sign-in, no recovery other than a new
invitation from Bart.

**Sessions** are a random 32-byte token in `__Host-ola` (HttpOnly, Secure, SameSite=Strict,
Path=/, no Domain). The database keeps its sha256. Every request checks: not revoked, before
its absolute expiry (14 days), used within the idle limit (24 hours), person active. Sign-out
revokes it; `admin.mjs revoke-sessions` and `suspend` end every session of a person at once.
A request that stays open (the event stream, a download) is checked again every second, so
removal from the team, sign-out, revocation, suspension, expiry and the idle limit cut it too; an
open stream does not count as use.
**CSRF**: a write must carry our exact `Origin` and `X-Ola-CSRF`, an HMAC of the session id the
page learns from `/api/me`, compared in constant time; a fetch marked cross-site or same-site
(`Sec-Fetch-Site`) is refused on `/api` and `/oc`. **Rate limits** on `/api/auth/*`: per client
address (10 at once, 10 a minute) and for everyone together (60 a minute), in memory only.

**Authorization on every request.** The page names its workspace in `?w=<slug>` (per tab) and
sends it as `X-Ola-Workspace` (a download link, which cannot carry a header, as `?w=`). The front
desk looks up the person's role in that workspace's team on each request, so removing a member
takes effect on their next request. Not a member, a closed workspace, a malformed name: 404,
the same answer as a workspace that does not exist. Viewers read (the project, files, downloads,
conversations); owners and members also upload, delete and run. The opencode routes the page
may use, and whether each needs `read` or `run`, are one list: `ALLOWED` in
`web/server/proxy.mjs`, used by both the front desk and the dev server. Anything else is 403.
The query string goes to opencode without `directory` or `workspace` (opencode would open
another project instance there). The proxy talks to the workspace's desk socket with the workspace's opencode password, read
from its secrets file (600) per request, never sent to the browser. What comes back is the
workspace's word (the agent can replace opencode on its own loopback): its type is forced to
JSON or an event stream, a plain reply is capped at 32 MiB, and every API response carries a
`sandbox` CSP and `nosniff`.

**Files** go through the workspace's own tools over `container exec`, without blocking the
server: uploads stream into `ola-put` (50 MiB by default, plain names only, counted and hashed
on the way and compared with what the VM reports; no copy on the host's disk), downloads come
from `ola-get` (which opens each part of the path with `O_NOFOLLOW`, so a link the agent plants,
say to `/proc/1/environ`, is refused), deletes from `ola-rm`, the list from `ola-files`. Each is
in the audit log. The delete confirmation's text is a setting (`OLA_FD_DELETE_NOTICE`); the
default says the product decision: the file leaves the workspace at once and stays in encrypted
backups for up to 14 days.

**Serving.** One origin: the built page and the API. Every response: HSTS, `nosniff`,
`Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, COOP and CORP same-origin, a
Permissions-Policy. The page's CSP: `default-src 'none'; script-src 'self'; style-src 'self';
img-src 'self' data:; font-src 'self'; connect-src 'self'; … frame-ancestors 'none'` (no inline
script; `index.html` has none). The Host header must be the origin's, or 421. The server binds
127.0.0.1 (or ::1) and refuses any other bind address.

**The preview origin (not in this milestone).** Nothing a workspace makes is ever served from
this origin as a page: downloads are `attachment` with a `sandbox` CSP. Sites and previews the
agent builds will be served from a **separate registrable domain** (for example
`ola-preview.net`, not `preview.ola.cx`: a subdomain is the same site, so SameSite=Strict
cookies would be sent to it and its pages could be "same-site" to the app), each preview on its
own subdomain, with a sandboxed CSP, no cookies of ours, and access by a short-lived signed
link minted here for members. The seam is the "Open" action on a thing; today it downloads.

**"People working"** in the header is the number of people who made a request in the last five
minutes (counted in memory, never written, never who), out of the 4 workspaces the machine runs
at once.

**The admin CLI** (`frontdesk/admin.mjs`; no admin web page in this milestone):

```bash
cd apps/activist-ai/frontdesk && npm ci
export OLA_FD_ORIGIN=http://localhost:4700   # https://app.ola.cx on the Studio
node admin.mjs add-person maria --name "Maria L."
node admin.mjs create-workspace eviction --name "Spring eviction report" --team ndtu --team-name "North District Tenants’ Union" --owner maria
node admin.mjs add-member ndtu dana member        # or viewer, owner; run again to change a role
node admin.mjs invite maria                       # prints the link once; send it by a channel you trust
node admin.mjs remove-member ndtu dana | revoke-sessions maria | suspend maria
node admin.mjs shown-to-cloud eviction --by maria # record a cloud agent's look, with her yes
node admin.mjs audit --workspace eviction | list
node server.mjs                                   # serves http://localhost:4700 on 127.0.0.1 only
```

`create-workspace` calls `ws.mjs create`; restart the gateway afterwards (it reads its tokens at
start). Settings: `OLA_FD_ORIGIN`, `OLA_FD_PORT`, `OLA_FD_BIND`, `OLA_FD_DATA`
(`~/.ola-frontdesk`), `OLA_FD_DIST`, `OLA_FD_MAX_UPLOAD_MB`, `OLA_FD_SESSION_HOURS`,
`OLA_FD_IDLE_HOURS`, `OLA_FD_SIGNIN_BURST`, `OLA_FD_SIGNIN_PER_MIN`, `OLA_FD_DELETE_NOTICE`,
and the workspace's `OLA_HOME` and `OLA_GATEWAY_PORT`. The web page is built on the iMac
(`cd web && npm run build`) and copied with the rest.

**Threat model.** Built against: (1) an outsider on the internet with no account (guessing
invitations and sessions, CSRF, clickjacking, DNS rebinding, a hostile site the person visits);
(2) a signed-in person reaching a workspace that is not theirs, or doing more than their role
allows; (3) a stolen cookie (it dies at sign-out, revocation, expiry or idle); (4) a hostile
agent inside a workspace, whose every byte back is untrusted (typed and capped replies, strict
file lists, no symlink followed, no host path built from what it says, nothing it makes served
as a page); (5) a copy of the platform database (no session or invitation in clear, no file
name or content). Not in it: Bart or anyone with the host account (it reads every workspace;
M3 of the workspace review), the relay and TLS (not built), the browser or the person's device
itself, and opencode's own permission prompts as a boundary.

**The proofs: `node frontdesk/check.mjs`** on the mini (after `npm ci` and `npx playwright
install chromium` in `frontdesk/`). It makes three made-up people and two 1 GiB workspaces and
drives Chromium with a virtual authenticator holding each person's passkey: invite → passkey →
project; an invitation works once and expires; the cookie's attributes; sign-out and sign-in
again; an open event stream ends when its viewer is removed (a member's stays open), the
query cannot pick another folder, and a workspace that forges 20,000 "read by a run" events gets
200 rows written and cannot push people's rows out of the activity view; bob gets 404 from all 17 workspace routes of alice's workspace by API (and for malformed
names) and sees "not one of yours" by direct URL; the opencode door refuses routes the page
does not use; upload, list, download (same bytes) and delete through the page, with the 14-day
wording in the confirmation, each in the audit log, and no file name or content anywhere in the
database file; size and name limits and a planted symlink refused; a viewer reads and cannot
upload, delete or run (every write route); 7 CSRF and cross-site cases refused, and a hostile
page's form post and fetch do nothing; a stolen cookie fails on every route after revocation,
its open event stream is cut, and the open page goes back to sign-in; expiry and idle limit; the headers and a wrong Host;
the working count; one real request in the drawer inside the sealed workspace through the
gateway (Together as the stand-in; `--no-live` skips it); the sign-in rate limits; and no
request from any page to another origin.

**After the outside review (2026-11-16, private notes):** `frontdesk/check.mjs` **25 of 25** on
the mini with the live request, 24 of 24 with `--no-live`; `web/check.mjs` 21 of 21 on the iMac.
"Read by a run" now writes one row per file per watch and at most 200 per prompt (the stream is
the workspace's word), and `/api/activity` gives run rows their own 200.

**Measured 2026-11-16 on the mini, before the review:** `frontdesk/check.mjs` **22 of 22** (twice with the live
request: GLM-5.3-Flash read `survey.csv` and wrote `summary.md` inside fd-a, 3 gateway requests
from `ws-fd-a`, one `file_read_by_run` row, the right count of 48), and 21 of 21 with
`--no-live`; `workspace/check.mjs` 64 of 64 on image 2.3.0-3; `web/check.mjs` 21 of 21 on the
iMac; `npm test` in `frontdesk/` (6) and `web/` (10).

**Not done yet.** Idle stop of workspaces (30 minutes); rotating a workspace's opencode password
and gateway token when a member is removed; the gateway still needs a restart after a new
workspace (M6); per-address rate limits behind the relay need the PROXY protocol (until then the
global bucket is what holds); "read by a run" sees opencode's `read` tool, not a shell command
that reads a file; an upload cut off mid-way can leave a hidden `.upload-*` temp file in the
workspace; the activity view in the page (the API exists); a second passkey from inside the app
(today: a new invitation); the preview origin; the admin web page; a launchd job for the front
desk. Open from the outside review: a connection with an unread body is held after an early
refusal (requestTimeout 15 min, 512 connections); the global sign-in bucket lets anyone hold off
every sign-in; `/api/project` runs one `container exec` per `.csv`/`.md` the agent wrote; no cap
on one person's concurrent uploads and downloads; a download of a FIFO hangs and leaves its exec
running; an unused invitation stays good after a new one, and adds a passkey to an active account.

## Rules for this code

- Nothing here logs content: no prompts, files, tool arguments or replies. The gateway's request line
  (time, caller, route, model, status, token counts, tries, queue wait, milliseconds, and on failure a
  fixed reason) is the whole record.
- Until the Mac Studio is the model server, every file a test touches is made up. `make-survey.py`
  is the pattern: invented people, known answers, the answers never placed in the workspace.
- A workspace gets a gateway token, never the model server's key.
