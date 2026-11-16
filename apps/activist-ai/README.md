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
| **Workspace** | one sealed Linux machine per person (Apple `container`), with a route to the gateway and nothing else | not built |
| **Front desk and page** | sign-in with passkeys, our own web page, starts and stops workspaces | not built |
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

**Routes.** `POST /v1/chat/completions` (streamed or not), `GET /v1/models` (the names in
`GATEWAY_MODELS`), `GET /v1/usage` (with a caller token: that caller's week, e.g.
`"fraction_used": 0.38`; with `GATEWAY_USAGE_TOKEN`: every caller plus requests in flight and
waiting. That token can read usage and nothing else, so the web app never needs a caller token).

**What it enforces, in the order a request meets it:**

| Limit | Setting | Default | What the caller gets |
|---|---|---|---|
| Who | `GATEWAY_TOKENS` `name:token,…` (token 24+ printable chars) | required | 401 |
| Body size | `GATEWAY_MAX_BODY_BYTES` | 4 MiB | 413, from `Content-Length` before a byte is read, or the moment a chunked body passes the cap; the connection is closed |
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
before a request is queued, so the requests already in flight can overshoot by at most their own
size. A model server that reports no usage is counted as zero.

**Reading the log.** stdout, one JSON line per request, plus one `"event":"start"` line with
the limits in force:

```json
{"t":"2026-11-16T18:06:24.357Z","caller":"spike","route":"chat","model":"general","status":200,"why":null,"tries":1,"tokens_in":6393,"tokens_out":4875,"wait_ms":0,"ms":23180}
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

## Rules for this code

- Nothing here logs content: no prompts, files, tool arguments or replies. The gateway's request line
  (time, caller, route, model, status, token counts, tries, queue wait, milliseconds, and on failure a
  fixed reason) is the whole record.
- Until the Mac Studio is the model server, every file a test touches is made up. `make-survey.py`
  is the pattern: invented people, known answers, the answers never placed in the workspace.
- A workspace gets a gateway token, never the model server's key.
