# activist-ai

A private agent service: Claude-Code-style work (an agent that reads your files, runs code and
writes results in a workspace) on open models, on one machine we own, for a few invited people.
Started 2026-11-15. The plan, the promise and its limits are in the private notes
(`apps/venture/private/ACTIVIST-AI-PLAN-2026-11-15.md`); this folder is the code.

## The parts

| Part | What it is | State |
|---|---|---|
| **Agent** | [opencode](https://github.com/anomalyco/opencode) 2.3.0 (MIT), one copy per person's workspace | runs a real task end to end (see the spike) |
| **Model gateway** | `gateway/server.mjs`: the one address a workspace may reach. Holds the model server's address and key, checks who is calling, keeps one line per request and never any content | built, used by the spike |
| **Model** | an OpenAI-compatible server. On the Mac Studio (arrives Nov 30 to Dec 3, 2026): a local MLX server. Until then: Together.ai, made-up data only | stand-in works with GLM-5.3-Flash |
| **Workspace** | one sealed Linux machine per person (Apple `container`), with a route to the gateway and nothing else | not built |
| **Front desk and page** | sign-in with passkeys, our own web page, starts and stops workspaces | not built |
| **Way in** | Tailscale; nothing on the public internet | not built |

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
  GATEWAY_MODELS=glm-5.3-flash=zai-org/GLM-5.3-Flash node gateway/server.mjs &
BOX_API_KEY=$(cat /tmp/gw-token) SPIKE_TAIL=30 spike/run-once.sh glm glm-5.3-flash http://127.0.0.1:4180/v1
```

Measured 2026-11-15 on the iMac, through the gateway:

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

## Rules for this code

- Nothing here logs content: no prompts, files, tool arguments or replies. The gateway's request line
  (time, caller, model, token counts, tries, milliseconds, and on failure the reason's shape) is the
  whole record.
- Until the Mac Studio is the model server, every file a test touches is made up. `make-survey.py`
  is the pattern: invented people, known answers, the answers never placed in the workspace.
- A workspace gets a gateway token, never the model server's key.
