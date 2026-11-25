#!/bin/bash
# The Mac Studio's install, everything that needs no human (OLA-100). Idempotent: each step checks
# first and does only what is missing, so running it again changes nothing.
#
#   setup.sh admin [--check]   from Bart's administrator account: Homebrew and its packages, Apple's
#                              container, power settings, the GPU memory cap at boot, Remote Login.
#                              Asks for sudo where macOS needs it. Checks (never does) the human
#                              steps: FileVault, the ola account, Tailscale.
#   setup.sh ola [--check]     signed in as the standard account `ola`: its folders, the staging clone,
#                              the model files, the model server's job, the gateway pointed at it,
#                              the first deploy, then ops/studio.mjs check.
#   setup.sh account           at the Studio's own screen, as the administrator: makes the standard
#                              account `ola`, lets it unlock the disk at boot and sign in over SSH.
#                              It says which password each prompt wants, and on any machine that is
#                              not the Studio it stops before changing anything (Nov 24: the same
#                              lines pasted by hand ran on the iMac and made an account there).
#   setup.sh check             both checks.
#
# --check reports what it would change and changes nothing (no sudo, no download, no file written).
# Nothing here prints a secret: env files are read only for whether a line is there.
# The order, the human steps and how to check each one: ops/studio/README.md.
set -u

ROLE=${1:-}
CHECK=0
for a in "$@"; do [ "$a" = "--check" ] && CHECK=1; done
[ "$ROLE" = "check" ] && CHECK=1

export PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
HERE=$(cd "$(dirname "$0")" && pwd)

# ---------------------------------------------------------------- what is installed (one place)
BREW_FORMULAE="node age llama.cpp"          # node: every service; age: backups; llama.cpp: the model server
BREW_CASKS="ngrok"                          # the public address (ops/tunnel.mjs)
CONTAINER_VERSION=1.7.1                     # Apple's container, the version staging runs
CONTAINER_PKG="https://github.com/apple/container/releases/download/${CONTAINER_VERSION}/container-${CONTAINER_VERSION}-installer-signed.pkg"
WIRED_MB=102400                             # GPU may wire 100 GiB (default ~96 GiB); README, "Memory"
REPO=https://github.com/bdecrem/hilma
MODEL_REPO=ggml-org/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-GGUF
MODEL_FILE=NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-Q4_0.gguf        # 72.1 GB
MMPROJ_FILE=mmproj-NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-Q8_0.gguf # 1.0 GB, the picture encoder
MODEL_ALIAS=nemotron
MODEL_PORT=8080
MODEL_CTX=524288                            # shared by MODEL_SLOTS: 128k tokens each
MODEL_SLOTS=4                               # the machine runs at most 4 projects at once
GATEWAY_NAMES="general see ocr read translate route"   # every name the local model answers

# ---------------------------------------------------------------- the step helper
N_OK=0; N_DO=0; N_HUMAN=0; N_FAIL=0
# step "what" test-function do-function
step() {
  local what=$1 test=$2 do=$3
  if $test >/dev/null 2>&1; then echo "ok     $what"; N_OK=$((N_OK + 1)); return 0; fi
  if [ $CHECK = 1 ]; then echo "would  $what"; N_DO=$((N_DO + 1)); return 0; fi
  echo "doing  $what"
  if $do && $test >/dev/null 2>&1; then echo "done   $what"; N_DO=$((N_DO + 1)); return 0; fi
  echo "FAILED $what"; N_FAIL=$((N_FAIL + 1)); return 1
}
# human "what" test-function "the step for Bart"
human() {
  if $2 >/dev/null 2>&1; then echo "ok     $1"; N_OK=$((N_OK + 1)); else echo "BART   $1: $3"; N_HUMAN=$((N_HUMAN + 1)); fi
}
summary() {
  echo
  if [ $CHECK = 1 ]; then echo "$1: $N_OK in place, $N_DO would change, $N_HUMAN for Bart (nothing was changed)"
  else echo "$1: $N_OK were in place, $N_DO changed, $N_HUMAN for Bart, $N_FAIL failed"; fi
}
is_studio() { [ "$(sysctl -n hw.memsize)" -ge 100000000000 ]; } # 128 GB; the mini has 16
guard_apply() {
  [ $CHECK = 1 ] && return 0
  if ! is_studio && [ "${OLA_SETUP_ANY_MACHINE:-}" != 1 ]; then
    echo "This is not the Studio (less than 100 GB of memory). Run with --check, or set OLA_SETUP_ANY_MACHINE=1."; exit 2
  fi
}

# ================================================================ admin: Bart's administrator account
t_brew() { [ -x /opt/homebrew/bin/brew ]; }
d_brew() { NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; }
t_formula() { brew list --formula "$PKG"; }
d_formula() { brew install "$PKG"; }
t_cask() { brew list --cask "$PKG"; }
d_cask() { brew install --cask "$PKG"; }
t_container() { [ -x /usr/local/bin/container ] && /usr/local/bin/container --version | grep -q "version $CONTAINER_VERSION"; }
d_container() {
  local pkg; pkg=$(mktemp -d)/container.pkg
  curl -fL -o "$pkg" "$CONTAINER_PKG" && pkgutil --check-signature "$pkg" | grep -q "Developer ID Installer: Apple" && sudo installer -pkg "$pkg" -target /
}
t_power() { pmset -g | awk '$1=="sleep"{s=$2} $1=="autorestart"{a=$2} $1=="womp"{w=$2} END{exit !(s=="0" && a=="1" && w=="1")}'; }
d_power() { sudo pmset -a sleep 0 disksleep 0 autorestart 1 womp 1; }
WIRED_PLIST=/Library/LaunchDaemons/cx.ola.wiredlimit.plist
t_wired() { [ -f $WIRED_PLIST ] && [ "$(sysctl -n iogpu.wired_limit_mb)" = "$WIRED_MB" ]; }
d_wired() {
  sudo tee $WIRED_PLIST >/dev/null <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>cx.ola.wiredlimit</string>
  <key>ProgramArguments</key><array><string>/usr/sbin/sysctl</string><string>iogpu.wired_limit_mb=$WIRED_MB</string></array>
  <key>RunAtLoad</key><true/>
</dict></plist>
EOF
  sudo chown root:wheel $WIRED_PLIST && sudo chmod 644 $WIRED_PLIST
  sudo launchctl bootout system/cx.ola.wiredlimit 2>/dev/null
  sudo launchctl bootstrap system $WIRED_PLIST
}
t_ssh() { nc -z -G 2 127.0.0.1 22; }
d_ssh() { sudo systemsetup -f -setremotelogin on; }
t_filevault() { fdesetup status | grep -q "FileVault is On."; }
t_ola_user() { id ola && ! id -Gn ola | tr ' ' '\n' | grep -qx admin; }
t_ola_unlocks() { sysadminctl -secureTokenStatus ola 2>&1 | grep -q ENABLED; }
# Remote Login may be limited to a list (com.apple.access_ssh); then ola has to be on it.
t_ola_ssh() { ! dscl . -read /Groups/com.apple.access_ssh >/dev/null 2>&1 || dseditgroup -o checkmember -m ola com.apple.access_ssh | grep -q "^yes"; }
d_ola_ssh() { sudo dseditgroup -o edit -a ola -t user com.apple.access_ssh; }
t_tailscale() { tailscale status --self --peers=false 2>/dev/null | grep -q '^100\.' || /Applications/Tailscale.app/Contents/MacOS/Tailscale status --self --peers=false 2>/dev/null | grep -q '^100\.'; }

run_admin() {
  echo "== admin: $(whoami) on $(scutil --get ComputerName 2>/dev/null || hostname)"
  if [ $CHECK = 0 ] && ! id -Gn | tr ' ' '\n' | grep -qx admin; then echo "Run the admin part from an administrator account."; exit 2; fi
  guard_apply
  human "FileVault on, recovery key on paper" t_filevault "System Settings > Privacy & Security > FileVault (README step 2)"
  human "Tailscale signed in (Bart's account)" t_tailscale "install Tailscale from tailscale.com, sign in as bartdecrem (README step 3)"
  step "Homebrew" t_brew d_brew || return
  for PKG in $BREW_FORMULAE; do step "brew $PKG" t_formula d_formula; done
  for PKG in $BREW_CASKS; do step "brew cask $PKG" t_cask d_cask; done
  step "Apple container $CONTAINER_VERSION" t_container d_container
  step "never sleeps, restarts after a power cut, wakes on the network" t_power d_power
  step "GPU may wire $WIRED_MB MB, set again at every boot (cx.ola.wiredlimit)" t_wired d_wired
  step "Remote Login on (deploys and cert renewal from the iMac)" t_ssh d_ssh
  human "a standard account named ola" t_ola_user "at the Studio's own screen: setup.sh account (README step 4)"
  human "ola can unlock the disk at boot" t_ola_unlocks "at the Studio's own screen: setup.sh account (README step 4)"
  if t_ola_user >/dev/null 2>&1; then step "ola may sign in over SSH" t_ola_ssh d_ola_ssh; fi
  summary admin
}

# The one part a person types passwords into. Never pasted as loose sudo lines: this refuses on the wrong machine.
run_account() {
  local name; name=$(scutil --get ComputerName 2>/dev/null || hostname)
  if ! is_studio; then
    echo "STOP. This computer is \"$name\", not the Mac Studio. Nothing was changed."
    echo "Run this in Terminal on the Studio's own screen (in screen sharing: the Terminal inside that window)."
    exit 2
  fi
  if ! id -Gn | tr ' ' '\n' | grep -qx admin; then echo "STOP. Sign in to the Studio as the administrator first. Nothing was changed."; exit 2; fi
  echo "This is the Mac Studio ($name), signed in as $(whoami)."
  if t_ola_user >/dev/null 2>&1; then echo "ok     the account ola exists"
  else
    echo "1. First prompt, \"Password:\": the password of $(whoami), this Studio account."
    echo "   Second prompt: a NEW password for ola. Choose one and write it down."
    sudo sysadminctl -addUser ola -fullName Ola -password - || { echo "FAILED making the account ola"; exit 1; }
  fi
  if t_ola_unlocks >/dev/null 2>&1; then echo "ok     ola can unlock the disk at boot"
  else
    echo "2. It asks for a user name: type $(whoami). Then the password of $(whoami). Then the password of ola."
    sudo fdesetup add -usertoadd ola || { echo "FAILED letting ola unlock the disk"; exit 1; }
  fi
  t_ola_ssh >/dev/null 2>&1 || d_ola_ssh
  if t_ola_user >/dev/null 2>&1 && t_ola_unlocks >/dev/null 2>&1; then echo "Done. Nothing else to type."; else echo "Not finished: run it again."; exit 1; fi
}

# ================================================================ ola: the account that runs Ola
OLA=$HOME/.ola
STAGING=$HOME/ola-staging
MODELS=$HOME/ola-models
KEYFILE=$OLA/model-key
AGENT=$HOME/Library/LaunchAgents/cx.ola.model.plist
GWENV=$OLA/gateway.env
mode_of() { stat -f %Lp "$1" 2>/dev/null; }

t_home() { [ "$(mode_of "$HOME")" = 700 ] && [ "$(mode_of "$OLA")" = 700 ] && [ "$(mode_of "$HOME/Library/Logs/ola")" = 700 ] && [ "$(mode_of "$MODELS")" = 700 ]; }
d_home() { chmod 700 "$HOME" && mkdir -p "$OLA" "$HOME/Library/Logs/ola" "$MODELS" && chmod 700 "$OLA" "$HOME/Library/Logs/ola" "$MODELS"; }
t_clone() { [ -d "$STAGING/.git" ] && git -C "$STAGING" remote get-url origin | grep -q 'bdecrem/hilma'; }
d_clone() { git clone --no-checkout "$REPO" "$STAGING"; }
hf_size() { curl -fsS "https://huggingface.co/api/models/$MODEL_REPO/tree/main" | /opt/homebrew/bin/node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>{const f=JSON.parse(t).find(x=>x.path===process.argv[1]);console.log(f?f.size:0)})' "$1"; }
t_file() { [ -f "$MODELS/$F" ] && [ "$(stat -f %z "$MODELS/$F")" = "$(hf_size "$F")" ]; }
d_file() {
  local free; free=$(df -k "$MODELS" | awk 'NR==2{print $4*1024}')
  [ "$free" -gt "$(hf_size "$F")" ] || { echo "not enough disk for $F"; return 1; }
  curl -fL --retry 5 -C - -o "$MODELS/$F" "https://huggingface.co/$MODEL_REPO/resolve/main/$F"
}
t_key() { [ -s "$KEYFILE" ] && [ "$(mode_of "$KEYFILE")" = 600 ]; }
d_key() { (umask 077; openssl rand -hex 32 > "$KEYFILE"); }
model_plist() {
  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>cx.ola.model</string>
  <key>ProgramArguments</key><array>
    <string>/opt/homebrew/bin/llama-server</string>
    <string>--model</string><string>$MODELS/$MODEL_FILE</string>
    <string>--mmproj</string><string>$MODELS/$MMPROJ_FILE</string>
    <string>--alias</string><string>$MODEL_ALIAS</string>
    <string>--host</string><string>127.0.0.1</string>
    <string>--port</string><string>$MODEL_PORT</string>
    <string>--api-key-file</string><string>$KEYFILE</string>
    <string>--ctx-size</string><string>$MODEL_CTX</string>
    <string>--parallel</string><string>$MODEL_SLOTS</string>
    <string>--n-gpu-layers</string><string>999</string>
    <string>--jinja</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/ola/model.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/ola/model.log</string>
</dict></plist>
EOF
}
t_model_job() { [ -f "$AGENT" ] && [ "$(model_plist)" = "$(cat "$AGENT")" ] && launchctl print "gui/$(id -u)/cx.ola.model"; }
d_model_job() {
  mkdir -p "$(dirname "$AGENT")"   # a new account has no ~/Library/LaunchAgents (Nov 24)
  model_plist > "$AGENT"
  launchctl bootout "gui/$(id -u)/cx.ola.model" 2>/dev/null
  launchctl bootstrap "gui/$(id -u)" "$AGENT"
}
# The model answers, with the key, on loopback (loading 73 GB takes a minute or two).
t_model_up() { curl -fsS -m 5 -H "Authorization: Bearer $(cat "$KEYFILE")" "http://127.0.0.1:$MODEL_PORT/v1/models" | grep -q "\"$MODEL_ALIAS\""; }
d_model_up() { for _ in $(seq 1 60); do t_model_up && return 0; sleep 5; done; return 1; }
# The tunnel settings start the public address wherever they exist (ola.mjs install), so until README
# step 10 they wait under another name: the first deploy must not take app.ola.cx from the mini.
TUNNEL_WAITING=tunnel.env.waiting-for-step-10
t_envs() {
  for f in gateway frontdesk tls; do [ "$(mode_of "$OLA/$f.env")" = 600 ] || return 1; done
  [ "$(mode_of "$OLA/tunnel.env")" = 600 ] || [ "$(mode_of "$OLA/$TUNNEL_WAITING")" = 600 ] || return 1
  [ -d "$OLA/tls/current" ]
}
gw_models() { local s="" n; for n in $GATEWAY_NAMES; do s="$s${s:+,}$n=$MODEL_ALIAS"; done; echo "$s"; }
t_gateway_local() {
  [ -f "$GWENV" ] && grep -qx "UPSTREAM_BASE_URL=http://127.0.0.1:$MODEL_PORT/v1" "$GWENV" && grep -qx "GATEWAY_MODELS=$(gw_models)" "$GWENV" &&
    [ "$(grep '^UPSTREAM_API_KEY=' "$GWENV" | cut -d= -f2-)" = "$(cat "$KEYFILE" 2>/dev/null)" ]
}
set_env() { # file name value: replaces the line, keeps the file 600, prints nothing
  local tmp; tmp=$(mktemp "$1.XXXX") && chmod 600 "$tmp" && grep -v "^$2=" "$1" > "$tmp"; printf '%s=%s\n' "$2" "$3" >> "$tmp" && mv "$tmp" "$1"
}
d_gateway_local() {
  [ -f "$GWENV" ] || return 1
  [ -f "$GWENV.before-studio" ] || (umask 077; cp -p "$GWENV" "$GWENV.before-studio")
  set_env "$GWENV" UPSTREAM_BASE_URL "http://127.0.0.1:$MODEL_PORT/v1"
  set_env "$GWENV" UPSTREAM_API_KEY "$(cat "$KEYFILE")"
  set_env "$GWENV" GATEWAY_MODELS "$(gw_models)"
}
# The first deploy builds the workspace image, before `install` has made the job that keeps Apple's
# container services up: start them once here (Nov 24: "Plugins are unavailable", nothing deployed).
t_container_up() { /usr/local/bin/container system status | grep -q running; }
d_container_up() { /usr/local/bin/container system start --enable-kernel-install; }
t_signers() { [ -s "$OLA/allowed-signers" ]; }
t_deployed() { [ -f "$STAGING/current/apps/activist-ai/web/dist/index.html" ] && [ -f "$STAGING/deployed.json" ]; }
d_deployed() {
  # The first deploy has no release to run ola.mjs from: it runs from origin/main's own copy.
  # ola.mjs deploy serves only for a named caller (OLA-279): this install is one, before any runner.
  local boot; boot=$(mktemp -d)
  git -C "$STAGING" fetch -q origin && git -C "$STAGING" archive origin/main apps/activist-ai | tar -x -C "$boot" &&
    OLA_DEPLOY_VIA="studio setup.sh" node "$boot/apps/activist-ai/ops/ola.mjs" deploy origin/main ${OLA_UNSIGNED:+--unsigned} && node "$STAGING/current/apps/activist-ai/ops/ola.mjs" install
}
t_status() { node "$STAGING/current/apps/activist-ai/ops/ola.mjs" status; }

run_ola() {
  N_OK=0; N_DO=0; N_HUMAN=0
  echo "== ola: $(whoami) on $(scutil --get ComputerName 2>/dev/null || hostname)"
  if [ $CHECK = 0 ]; then
    id -Gn | tr ' ' '\n' | grep -qx admin && { echo "Run the ola part signed in as the standard account ola, not an administrator."; exit 2; }
  elif id -Gn | tr ' ' '\n' | grep -qx admin; then
    echo "(check only: $(whoami) is an administrator; on the Studio this part runs as ola)"
  fi
  guard_apply
  [ -x /opt/homebrew/bin/node ] && [ -x /usr/local/bin/container ] || { echo "BART   run the admin part first: setup.sh admin"; N_HUMAN=$((N_HUMAN + 1)); summary ola; return; }
  step "home, ~/.ola, logs and ~/ola-models mode 700" t_home d_home
  step "staging clone ~/ola-staging (no working tree)" t_clone d_clone
  for F in $MMPROJ_FILE $MODEL_FILE; do step "model file $F" t_file d_file; done
  step "the model server's key ~/.ola/model-key (600)" t_key d_key
  step "launchd job cx.ola.model: llama-server on 127.0.0.1:$MODEL_PORT" t_model_job d_model_job
  step "the model answers as \"$MODEL_ALIAS\"" t_model_up d_model_up
  human "the settings moved from the mini" t_envs "on the iMac: ops/studio/move-env.sh ola@<studio> (README step 6)"
  if t_envs; then step "the gateway uses the local model for: $GATEWAY_NAMES" t_gateway_local d_gateway_local; fi
  human "Bart's signing key in ~/.ola/allowed-signers" t_signers "README step 7 (or run once with OLA_UNSIGNED=1; deploys.log records it)"
  step "Apple's container services running (for the first image build)" t_container_up d_container_up
  if t_envs && { t_signers || [ "${OLA_UNSIGNED:-}" = 1 ]; }; then step "first deploy and the jobs (ola.mjs deploy, install)" t_deployed d_deployed
  elif [ $CHECK = 1 ] && ! t_deployed; then echo "would  first deploy and the jobs (after the settings and the signing key)"; N_DO=$((N_DO + 1)); fi
  if t_deployed; then
    if t_status >/dev/null 2>&1; then echo "ok     ola.mjs status: every job up"; else echo "no     ola.mjs status reports a problem: node ~/ola-staging/current/apps/activist-ai/ops/ola.mjs status"; fi
    echo; node "$STAGING/current/apps/activist-ai/ops/studio.mjs" check | sed 's/^/  /'
  fi
  summary ola
}

case "$ROLE" in
  admin) run_admin ;;
  ola) run_ola ;;
  account) run_account ;;
  check) run_admin; echo; run_ola ;;
  *) echo "usage: setup.sh admin|ola [--check] | setup.sh account | setup.sh check"; exit 2 ;;
esac
[ $N_FAIL = 0 ]
