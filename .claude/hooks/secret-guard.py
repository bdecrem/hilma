#!/usr/bin/env python3
"""PreToolUse guard for Bash: a command that would print a secret into the transcript is refused.

Why (Bart, 2026-11-17, after an agent printed an API key into its log, again): "I REFUSE TO ... ROTATE
KEYS BECAUSE YOU AND YOUR ... AGENTS KEEP LEAKING THEM. No more. Never again."
A rule that says "never print a secret" was already in every brief and was broken anyway, so this is code.

What it refuses: reading a file that holds secrets (env files, the ops vault, token and key files) with a
command whose output lands in the transcript, and dumping the environment after loading such a file.
What it allows: counting, names only, fingerprints, loading into a subshell, piping a value straight into
ssh / pbcopy / a file, and grep for a setting whose name does not look like a secret.
Exit 2 with a message on stderr blocks the call and tells the model why.
"""
import json
import re
import sys

SECRET_FILES = re.compile(
    r"(vault\.env|\.env\.local|(?<![\w.-])\.env(?![\w.-])|gateway\.env|frontdesk\.env|tls\.env|tunnel\.env|bart\.env|watch\.env"
    r"|\.almanac\.env|\.golembot\.env|\.macplus-backend\.env|claude-oauth-token|gateway-tokens|gateway-claude|gateway-hosted"
    r"|AuthKey_[A-Z0-9]+\.p8|\.p8\b|ngrok\.yml|id_rsa|id_ed25519|\.plumb/config\.json|private/KEY\b|stage-key\.json|\.credentials\.json)"
)
SENSITIVE_NAME = re.compile(r"(KEY|TOKEN|SECRET|PASS|AUTH|CREDENTIAL|USERS|COOKIE|PRIVATE)", re.I)
READERS = re.compile(r"(^|[\s;&|(`'\"])(cat|bat|less|more|head|tail|sed|awk|grep|egrep|rg|strings|nl|xxd|hexdump|od|base64|sort|tac|uniq|tee|open|jq|plutil|python3?|node|perl|ruby)\b")
ENV_DUMP = re.compile(r"(^|[\s;&|(`'\"])(printenv|env|export\s+-p|declare\s+-p|set)\s*($|[;&|)`\n])|ps\s+e?ww|launchctl\s+(print|getenv)|set\s+-x")
SAFE_SINK = re.compile(
    r"^\s*(wc\b|cut\s+-d=?\s*-?f?\s*1\b|cut\s+-d=\s+-f1\b|grep\s+-(c|q|l)\b|pbcopy\b|ssh\b|shasum\b|sha256sum\b|md5\b|openssl\s+dgst\b"
    r"|awk\s+['\"]?\{?\s*print\s+length|tr\s+-d\s+\S+\s*$|sed\s+-e?\s*['\"]s/=\.\*/|cut\s+-c\s*1-1?[0-9]\b)"
)


def refuse(why: str) -> None:
    sys.stderr.write(
        "Blocked by the secret guard: " + why + "\n"
        "This command would put a secret into the transcript. Use a form that does not print it:\n"
        "  names only:        cut -d= -f1 FILE\n"
        "  is it set:         grep -c '^NAME=' FILE\n"
        "  length / print:    V=$(grep '^NAME=' FILE | cut -d= -f2-); echo ${#V}\n"
        "  use it:            ( set -a; . FILE; set +a; your-command )   # never env, printenv or set -x after this\n"
        "  move it:           grep '^NAME=' FILE | ssh host 'umask 077; cat > file'\n"
        "  a plain setting:   grep '^OLA_FD_ORIGIN=' FILE   # only for names without KEY, TOKEN, SECRET, PASS, AUTH\n"
        "If you truly need the value shown, stop and ask the lead; do not work around this guard.\n"
    )
    sys.exit(2)


def stages(pipeline: str):
    return [s.strip() for s in re.split(r"(?<!\|)\|(?!\|)", pipeline)]


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    if data.get("tool_name") != "Bash":
        sys.exit(0)
    cmd = (data.get("tool_input") or {}).get("command") or ""
    # The container tool prints each sealed box's passwords in its JSON and inspect output.
    if re.search(r"\bcontainer\b[^|;&\n]*\b(inspect\b|(list|ls)\b[^|;&\n]*--format[ =]json)", cmd):
        refuse("`container inspect` and `container list --format json` print each project's passwords. Use plain `container ls` or `container ls -a`.")
    if not SECRET_FILES.search(cmd):
        sys.exit(0)

    loads_env = re.search(r"(^|[\s;&(])(\.|source)\s+\S*", cmd) and SECRET_FILES.search(cmd)
    if loads_env and ENV_DUMP.search(cmd):
        refuse("it loads a secrets file and then dumps the environment (env, printenv, set, set -x, ps eww).")

    # Look at each pipeline on its own.
    for pipeline in re.split(r";|&&|\|\||\n", cmd):
        if not SECRET_FILES.search(pipeline):
            continue
        st = stages(pipeline)
        # which stage touches the secret file with a reader?
        idx = next((i for i, s in enumerate(st) if SECRET_FILES.search(s) and READERS.search(" " + s)), None)
        if idx is None:
            continue  # cp, mv, chmod, ls, test, sourcing, writing to it: nothing printed
        reader = st[idx]
        rest = st[idx + 1:]
        # a value captured into a variable is not printed:  V=$(grep ... | cut ...)
        verb = READERS.search(" " + reader)
        before_verb = pipeline[: pipeline.find(reader)] + (" " + reader)[: verb.start() + 1] if verb else ""
        if re.search(r"\b[A-Za-z_][A-Za-z0-9_]*=\$\(\s*$", before_verb):
            continue
        # output redirected to a file (not the terminal)
        if re.search(r">\s*(?!/dev/(stdout|stderr|tty))\S+\s*$", st[-1]) and "tee" not in st[-1]:
            continue
        if rest and SAFE_SINK.search(rest[-1]):
            continue
        if any(SAFE_SINK.search(s) for s in rest) and not re.search(r"\b(cat|echo|printf)\b", " ".join(rest[-1:])):
            continue
        # the reader itself is harmless: counting or quiet
        if re.search(r"\bgrep\s+(-[a-zA-Z]*[cql][a-zA-Z]*)\b", reader) or re.search(r"\bwc\b", reader):
            continue
        # grep for a plainly named setting is fine
        m = re.search(r"\bgrep\b(.*)", reader)
        if m:
            pattern_part = SECRET_FILES.sub("", m.group(1))
            names = re.findall(r"\^([A-Z][A-Z0-9_]{2,})=", pattern_part)
            if names and not any(SENSITIVE_NAME.search(n) for n in names) and not re.search(r"-[a-zA-Z]*v", pattern_part.split(names[0])[0]):
                continue
        refuse("`" + reader[:120] + "` reads a secrets file and its output is not sent to a safe place.")
    sys.exit(0)


if __name__ == "__main__":
    main()
