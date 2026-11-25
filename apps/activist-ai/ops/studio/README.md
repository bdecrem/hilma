# The Mac Studio's install (OLA-100)

The Studio (M5 Max, 128 GB, 1 TB, arriving Nov 30 to Dec 3, Study 16 at CASBS) replaces the Mac mini as
the Ola machine. The mini stays the test machine and never holds user data. This is the install, in
order. Steps marked **Bart** need a person at the Studio; everything else is `setup.sh`, which checks
before it does anything, so running it twice changes nothing. `setup.sh check` (or `admin --check`,
`ola --check`) reports what it would change and changes nothing.

What the mini runs today, and where each part goes, is at the end.

## The steps

| # | Who | Step | How to check it worked |
|---|---|---|---|
| 1 | **Bart** | Setup Assistant: his own Apple ID, an **administrator** account (on the real Studio it is `admin`, Nov 24; `setup.sh` assumes no name). Skip iCloud Desktop & Documents. Name the computer `ola-studio`. | Signed in to the desktop |
| 2 | **Bart** | **FileVault on** (Setup Assistant asks, or System Settings > Privacy & Security > FileVault). Recovery key **written on paper**, not kept in iCloud. Setup Assistant may turn FileVault on with iCloud unlock and show no key (Nov 24): then `sudo fdesetup changerecovery -personal` prints a personal key to write down. | `fdesetup status` says `FileVault is On.` |
| 3 | **Bart** | **Tailscale**: install from tailscale.com/download, sign in as `bartdecrem`. | `tailscale status` lists `ola-studio` with a 100.x address |
| 4 | **Bart**, at the Studio's own screen | The **`ola` account**, standard, allowed to unlock the disk at boot and to sign in over SSH. One command, in Terminal **on the Studio** (in screen sharing: the Terminal inside that window), after step 5's clone:<br>`~/hilma/apps/activist-ai/ops/studio/setup.sh account`<br>It says which password each prompt wants. On any other computer it stops and changes nothing (Nov 24: the loose `sudo` lines this step used to list were pasted into the iMac's Terminal and made an account there). Then sign in as Ola at the Studio's screen once and **stay signed in**: its services run only while it is (fast user switching back to the administrator is fine). | `id -Gn ola` has no `admin`; `sysadminctl -secureTokenStatus ola` says ENABLED |
| 5 | script | In `bart`, from a copy of the repo (`git clone https://github.com/bdecrem/hilma ~/hilma`):<br>`~/hilma/apps/activist-ai/ops/studio/setup.sh admin`<br>Homebrew (and with it the Command Line Tools: git, swift), `node`, `age`, `llama.cpp`, `ngrok`; Apple `container` 1.7.1 (the signed pkg from GitHub, the version staging runs); never sleep, restart after a power cut, wake on the network; the GPU memory cap set at every boot (`/Library/LaunchDaemons/cx.ola.wiredlimit.plist`); Remote Login on. Asks for the password where sudo is needed. | It ends `admin: N were in place, M changed, 0 for Bart, 0 failed`; `setup.sh admin --check` then shows only `ok` |
| 6 | **Bart**, one command on the iMac | **Move the settings from the mini**, never printed:<br>`apps/activist-ai/ops/studio/move-env.sh ola@ola-studio`<br>(asks once for the `ola` password). Moves gateway, front desk, TLS and tunnel settings, the Claude token and the TLS certificate and key; paths naming `/Users/admin/` become the ola home. `--check` lists what would move. | It prints each file with mode `-rw-------` and `paths still naming /Users/admin: 0` |
| 7 | **Bart** | **Signing key** for deploys: on his own device, `ssh-keygen -t ed25519 -f ~/.ssh/ola-signing`, git set to sign with it, and its public line in the Studio's `~ola/.ola/allowed-signers` (README, "Deploying staging"). Until then the first deploy can run with `OLA_UNSIGNED=1`, which `deploys.log` records. | `node ops/studio.mjs check` shows `ok signed-deploys` |
| 8 | script | Sign in **as `ola`** (fast user switching is fine) and run<br>`git clone https://github.com/bdecrem/hilma /tmp/h && /tmp/h/apps/activist-ai/ops/studio/setup.sh ola`<br>Over SSH from the administrator instead (`nohup` fails there, "can't detach from console"): `sudo -u ola -H bash -c "cd ~ && (/Users/Shared/ola-setup/setup.sh ola > ~/setup-ola.log 2>&1 < /dev/null &)"`, with ola signed in at the screen so the model's job can load.<br>Home, `~/.ola`, logs and `~/ola-models` mode 700; the staging clone `~/ola-staging`; the model files (73 GB, resumable); the model server's key `~/.ola/model-key`; launchd job `cx.ola.model`; waits until the model answers; points the gateway at it; the first deploy (`ola.mjs deploy`, then `install`); then `ops/studio.mjs check`. | It ends `0 failed`; `ola.mjs status` exits 0; the model check below passes |
| 9 | **Bart** | **Backups**: plug in the SanDisk, then as ola `node ~/ola-staging/current/apps/activist-ai/ops/backup.mjs key`, print the recovery sheet, `init-drive`, `node …/ops/ola.mjs install` (README, "Encrypted backups"). A new key: the mini's protects only made-up data. | `studio.mjs check` shows `ok backups` |
| 10 | **Bart** | **The public address moves** (minutes of downtime): on the mini `launchctl bootout gui/501/cx.ola.tunnel && mv ~/.ola/tunnel.env ~/.ola/tunnel.env.moved`; on the Studio rename `~/.ola/tunnel.env.waiting-for-step-10` back to `~/.ola/tunnel.env`, then `node …/ops/ola.mjs install` (the moved file waits under that name from before the first deploy, renamed by hand on Nov 24, so the install does not take the address from the mini early). On the iMac, the certificate renewal job gets `OLA_CERT_MINI=ola@ola-studio`. | `curl -sI https://app.ola.cx/api/health` answers 200; `ola.mjs status` shows `cx.ola.tunnel` running on the Studio |
| 11 | script | `node ~/ola-staging/current/apps/activist-ai/ops/studio.mjs check`, as ola | `all 7 done: ready for real data`. Only then does a person's real file reach the Studio |

## The local model

**One model: NVIDIA Nemotron 3.5 Super VL** (120B, 12B active, a hybrid Mamba/attention MoE; it
reads pictures). It is the only good candidate that fits: on Together it passed opencode's real
request and the survey task 16/16 three times and read the chart and the scan (README, "Specialists
and paper lookup"). **No Chinese models**, Bart's rule: Qwen, GLM, DeepSeek, Kimi and MiniMax are not
installed or tried, whatever a benchmark says; any new candidate needs his yes first.

- **Files:** `ggml-org/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-GGUF` (NVIDIA's own GGUFs, published by
  the llama.cpp maintainers): `…-Q4_0.gguf`, 72.1 GB, and the picture encoder `mmproj-…-Q8_0.gguf`,
  1.0 GB, in `~ola/ola-models`. Q4_0 is the format of llama.cpp's Apple Silicon table the Studio was
  chosen on (3,220 tokens/s prompt reading on a small model; this model's own speed is measured on arrival).
- **Server:** `llama-server` from Homebrew's `llama.cpp`, launchd job `cx.ola.model` in the ola
  account, `127.0.0.1:8080` only, with a key (`~/.ola/model-key`, 600) so nothing else on the machine
  can call it; `--jinja` for tool calls, 4 slots (the machine runs at most 4 projects) sharing a
  524,288-token context, 128k each. Its log: `~/Library/Logs/ola/model.log`.
- **The gateway:** `UPSTREAM_BASE_URL=http://127.0.0.1:8080/v1` and every name, `general`, `see`,
  `ocr`, `read`, `translate`, `route`, mapped to the one model (`GATEWAY_MODELS`). The specialists
  ran on Muse Glimmer 30B on Together; on the Studio Nemotron takes those names, so no project's
  file leaves the machine for them. The two fallbacks (Claude, a hosted model) stay off by default
  and per project, as now. The gateway's old settings are kept as `gateway.env.before-studio`.
- **Memory:** 73 GB of weights, about 25 GB for the context and compute, leaves about 30 GB for macOS,
  the services and four project VMs. `iogpu.wired_limit_mb=102400` (100 GiB) lets the GPU hold that
  much (the default on 128 GB is about 96 GiB); set at every boot by `cx.ola.wiredlimit`.
- **First thing to measure, before any real file:** the gateway's tool-call probe and the survey
  task through the local model (the same 16 checks as on Together), and the planted-instruction set
  (`evals/run-instructions.sh`). If tool calls fail under llama.cpp, try an MLX server
  (vllm-metal, LM Studio's MLX engine) with the same model; do not switch models without Bart.

Check by hand, as ola:
```bash
curl -s -H "Authorization: Bearer $(cat ~/.ola/model-key)" http://127.0.0.1:8080/v1/models | grep -o '"nemotron"'
```

## Where everything the mini runs goes (surveyed 2026-11-20)

| On the mini today | On the Studio |
|---|---|
| launchd `cx.ola.container`, `gateway`, `frontdesk`, `tls`, `tunnel`, `watch`, `ci`, `backup`, `restoretest` (all from `~/ola-staging/current`, written by `ola.mjs install`) | the same, written by the first deploy in the ola account (step 8). Tunnel only after step 10 |
| `cx.ola.door.*`, `cx.ola.desk.*` per running workspace | the same, made by `ws.mjs` as projects open |
| `cx.ola.bart` (Bart's opencode, no longer used by the apps) | stays on the mini |
| `~/.ola/*.env`: gateway, frontdesk, tls, tunnel, backup, bart | gateway, frontdesk, tls, tunnel move (step 6); backup is made new (step 9); bart stays |
| `~/.ola-frontdesk/platform.db` (staging's people and projects, made-up data) | a new, empty platform database; people are added with `frontdesk/admin.mjs add-person` |
| Workspace images `ola-workspace:2.3.0-*` | built by the first deploy (`ws.mjs image --missing`) |
| Together as the model | the local model; Together only behind the hosted fallback, off by default |
| `~/ola-deploy-kit.sh` (fetch, `deploy origin/main --unsigned`, install, status) | not copied: on the Studio a deploy is signed, `node ~/ola-staging/current/apps/activist-ai/ops/ola.mjs deploy`, started by a caller `ops/signers.mjs` DEPLOY_CALLERS names (OLA-279; by hand it is refused: add the Studio's own caller there when its updates are set up) |
| Backup to a folder on its own disk (no drive) | the SanDisk, plus the second drive swapped weekly (step 9) |
| Xcode 26.3, used to archive the apps (`apple/testflight/ship-via-mini.sh`) | not installed: shipping stays on the mini. The Studio has only the Command Line Tools |
| The Venture runner, Mac Plus services, BlueBubbles, the Discord bot, Ollama, Tailscale | none of it in the ola account (`studio.mjs check`, `alone`); Tailscale in Bart's account only |
| Tailscale (CLI 1.94, daemon 1.102) | the app, in Bart's account (step 3) |

Open: `ola.mjs install` loads `cx.ola.ci` wherever it runs, so after step 8 both machines would check
every change to main. One should; the mini (the test machine) is the natural one.

## Only a version that passed on the mini reaches the Studio (OLA-272, built at step 8)

Decided by Bart, Nov 20: checks run on the test machine against the exact version, and passing
there is what lets a version reach the machine people use. Built during the Studio's setup, not
before, because until then there is one machine. What to build:

1. **Every check stays on the mini.** The suites, the request tests and the checkers' tries run
   against `~/ola-staging` on the mini, as today. The Studio runs no suite and no checker, and
   never makes a test project or a made-up account.
2. **The Studio's deploy asks the mini first.** `ola.mjs deploy` on the Studio refuses a commit
   unless the mini's `~/ola-staging/deploys.log` has a `deployed <commit12>` line for it (read
   over Tailscale, read only) and no checker failed a ticket on that release. The refusal names
   the commit and says "not passed on the test machine". `cx.ola.ci` is not loaded on the Studio.
3. **After the switch, a short set only.** On the Studio a deploy runs a few requests that touch
   no one's project (sign-in page answers, the gateway answers, the model answers), in under a
   minute, and switches back on a failure.
4. **People are not waited on.** The Studio's switch never waits for projects to close and never
   cuts a request in progress: OLA-240 and OLA-94, which must land first.
5. **The queue on the mini** is OLA-283 (suites in parallel, a result reused for the same version).
