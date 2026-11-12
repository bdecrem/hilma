#!/usr/bin/env python3
"""How far does a Claude plan go? Runs real tasks through Claude Code until the plan says stop.

  python3 run.py --smoke     two tiny calls (one per model) to check the setup
  python3 run.py             the test: tasks back to back until the 5-hour limit hits
  python3 run.py --once      each task once, then stop (calibration, never hits the limit)
  python3 run.py --only C1,D2
  python3 run.py --dry-run   print the plan, call nothing

This script is the referee, not a Claude session: it costs the plan nothing. Each task is
one headless `claude -p` call in a fresh copy of fixture/. The script reads time from the
computer's clock (wall time, cross-checked against outside servers, the machine kept
awake), tokens from Claude Code's own report of every call, and the plan's meters from
`claude -p /usage`, which uses no tokens. Results go to results/<start time>/: one line per
task in events.jsonl, the raw stream of every call, and report.md, rewritten after every
task so a crash or Ctrl-C still leaves a report. Python 3.8+, standard library only.
"""
import argparse, datetime, email.utils, json, os, platform, re, shutil, subprocess, sys, tempfile, threading, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import checks, report  # noqa: E402

FIXTURE = os.path.join(HERE, 'fixture')
MODELS = {'opus': 'claude-opus-5-5', 'sonnet': 'claude-sonnet-5-5'}
PREAMBLE = ("You are working in a snapshot folder copied for this one task: there is no git remote, nothing deploys, "
            "and there are no API keys, databases or other machines. Do the whole task the way you would in a real project, "
            "including running and checking what you make. Do not commit, push, deploy or run the Next.js build, whatever "
            "CLAUDE.md says about that. End with a short summary of what you did and anything left undone.\n\nThe task:\n")
# what Claude Code says when the plan runs out (headless wording varies by version, so match loosely)
LIMIT_RE = re.compile(r"usage limit|limit reached|reached your limit|hit your limit|limit will reset|resets? at \d|out of (?:extra )?usage|rate_limit|API Error: 429", re.I)
SMOKE = {'id': 'SMOKE', 'kind': 'smoke', 'title': 'smoke test', 'uses': [], 'timeout_min': 5, 'max_turns': 6,
         'prompt': 'Create a file hello.txt containing the single word hello, then reply with the word done.'}

def iso(t): return datetime.datetime.fromtimestamp(t).astimezone().isoformat(timespec='seconds')
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)

def find_claude(arg):
    for c in [arg, shutil.which('claude'), '~/.local/bin/claude', '~/.claude/local/claude', '/opt/homebrew/bin/claude', '/usr/local/bin/claude']:
        if c and os.path.exists(os.path.expanduser(c)): return os.path.expanduser(c)
    sys.exit('Claude Code not found. Install it and log in with the plan to test, or pass --claude /path/to/claude.')

def child_env():
    """An API key in the environment would bill the API instead of the plan: drop it."""
    env, dropped = dict(os.environ), []
    for k in ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX']:
        if env.pop(k, None) is not None: dropped.append(k)
    return env, dropped

# ---------- the referee's clock ----------
def net_time():
    """seconds the local clock is behind (+) or ahead (-) of three outside servers (HTTP Date, 1 s resolution)"""
    out = {}
    for url in ['https://www.google.com', 'https://www.cloudflare.com', 'https://www.apple.com']:
        try:
            t0 = time.time(); r = urllib.request.urlopen(urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'plan-meter'}), timeout=10); t1 = time.time()
            out[url] = round(email.utils.parsedate_to_datetime(r.headers['Date']).timestamp() - (t0 + t1) / 2, 1)
        except Exception as e: out[url] = 'unreachable: %s' % type(e).__name__
    return out

class Heartbeat(threading.Thread):
    """writes the time every 20 s, so the report can prove the clock ran continuously (no sleep)"""
    def __init__(self, path): super().__init__(daemon=True); self.path = path; self.stop = threading.Event()
    def run(self):
        with open(self.path, 'a') as f:
            while not self.stop.is_set():
                f.write(json.dumps({'t': time.time(), 'mono': time.monotonic()}) + '\n'); f.flush(); self.stop.wait(20)

def keep_awake():
    if platform.system() == 'Darwin' and shutil.which('caffeinate'):
        return subprocess.Popen(['caffeinate', '-dimsu', '-w', str(os.getpid())])
    if shutil.which('systemd-inhibit'):
        return subprocess.Popen(['systemd-inhibit', '--what=sleep:idle', '--why=plan-meter', 'sleep', 'infinity'])
    return None

# ---------- the plan's meters ----------
def meter(claude, env):
    """`claude -p /usage` prints the plan's bars without calling a model: zero tokens"""
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        try:
            p = subprocess.run([claude, '-p', '/usage', '--output-format', 'json'], cwd=tmp, env=env, capture_output=True, text=True, timeout=120)
            try: text = json.loads(p.stdout).get('result') or ''
            except ValueError: text = p.stdout + p.stderr
        except Exception as e: text = 'meter failed: %s' % e
    bars = {}
    for line in text.splitlines():
        m = re.match(r'\s*(.+?):\s*(\d+(?:\.\d+)?)\s*%\s*used(?:\s*[·•-]\s*resets\s*(.+))?', line)
        if m: bars[m.group(1).strip()] = {'pct': float(m.group(2)), 'resets': (m.group(3) or '').strip()}
    return {'at': iso(t0), 'bars': bars, 'subscription': 'subscription' in text.lower(), 'text': text[:3000], 'seconds': round(time.time() - t0, 1)}

def bar(m, *words):
    for k, v in (m or {}).get('bars', {}).items():
        if all(w in k.lower() for w in words): return v['pct']
    return None

# ---------- one task ----------
def workspace(task, root, seq, claude_md):
    work = os.path.join(root, 'work', '%03d-%s' % (seq, task['id']))
    os.makedirs(work)
    if claude_md: shutil.copyfile(os.path.join(FIXTURE, 'CLAUDE.md'), os.path.join(work, 'CLAUDE.md'))
    for u in task['uses']: shutil.copytree(os.path.join(FIXTURE, u), os.path.join(work, u))
    g = ['git', '-c', 'user.name=plan-meter', '-c', 'user.email=plan-meter@localhost']
    subprocess.run(g[:1] + ['init', '-q'], cwd=work); subprocess.run(g + ['add', '-A'], cwd=work); subprocess.run(g + ['commit', '-qm', 'snapshot'], cwd=work)
    return work

def call_claude(claude, env, work, prompt, model, max_turns, timeout_s, raw_path, bare=False):
    cmd = [claude, '-p', prompt, '--model', model, '--output-format', 'stream-json', '--verbose',
           '--dangerously-skip-permissions', '--max-turns', str(max_turns), '--no-session-persistence']
    if bare: cmd.append('--strict-mcp-config')  # no MCP servers or connectors: their tool lists ride along on every call
    result, tools, limit_lines, killed = None, {}, [], {'v': False}
    p = subprocess.Popen(cmd, cwd=work, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
    def kill(): killed['v'] = True; p.kill()
    timer = threading.Timer(timeout_s, kill); timer.start()
    err = []
    t_err = threading.Thread(target=lambda: err.extend(p.stderr.readlines()), daemon=True); t_err.start()
    with open(raw_path, 'w') as raw:
        for line in p.stdout:
            raw.write(line)
            try: ev = json.loads(line)
            except ValueError: continue
            if ev.get('type') == 'result': result = ev
            elif ev.get('type') == 'assistant':
                for b in (ev.get('message') or {}).get('content') or []:
                    if b.get('type') == 'tool_use': tools[b.get('name')] = tools.get(b.get('name'), 0) + 1
            if ev.get('type') == 'system' and 'limit' in json.dumps(ev).lower(): limit_lines.append(line[:500])
    p.wait(); timer.cancel(); t_err.join(5)
    return result, tools, ''.join(err)[-2000:], limit_lines, killed['v'], p.returncode

def tokens(res):
    u = (res or {}).get('usage') or {}
    t = {'input': u.get('input_tokens', 0) or 0, 'output': u.get('output_tokens', 0) or 0,
         'cache_read': u.get('cache_read_input_tokens', 0) or 0, 'cache_write': u.get('cache_creation_input_tokens', 0) or 0}
    t['total'] = sum(t.values())
    by = {}
    for m, v in ((res or {}).get('modelUsage') or {}).items():
        by[m] = {'input': v.get('inputTokens', 0) or 0, 'output': v.get('outputTokens', 0) or 0, 'cache_read': v.get('cacheReadInputTokens', 0) or 0,
                 'cache_write': v.get('cacheCreationInputTokens', 0) or 0, 'cost_usd': round(v.get('costUSD', 0) or 0, 4)}
    return t, by

def run_task(task, seq, model_tier, model_id, args, claude, env, root):
    work = workspace(task, root, seq, not args.no_claude_md)
    start, mono = time.time(), time.monotonic()
    res, tools, err, limit_lines, killed, rc = call_claude(claude, env, work, PREAMBLE + task['prompt'], model_id, task.get('max_turns', 80), task.get('timeout_min', 25) * 60, os.path.join(work, '.claude-stream.jsonl'), args.bare)
    end = time.time()
    text = ((res or {}).get('result') or '') + '\n' + err + '\n' + ''.join(limit_lines)
    failed = res is None or res.get('is_error') or (res.get('subtype') not in (None, 'success'))
    limit = bool(failed and LIMIT_RE.search(text)) or bool(limit_lines and failed)
    ok, note = (None, 'limit hit before the work was done') if limit else checks.check(task['id'], work)
    subprocess.run(['git', 'add', '-A'], cwd=work, capture_output=True)
    diff = subprocess.run(['git', 'diff', '--cached', '--shortstat'], cwd=work, capture_output=True, text=True).stdout.strip()
    t, by = tokens(res)
    return {
        'seq': seq, 'id': task['id'], 'kind': task['kind'], 'title': task['title'], 'tier': model_tier, 'model': model_id,
        'start': iso(start), 'end': iso(end), 'start_ts': start, 'end_ts': end,
        'wall_s': round(end - start, 1), 'mono_s': round(time.monotonic() - mono, 1),
        'claude_duration_s': round(((res or {}).get('duration_ms') or 0) / 1000, 1), 'api_duration_s': round(((res or {}).get('duration_api_ms') or 0) / 1000, 1),
        'turns': (res or {}).get('num_turns'), 'tokens': t, 'by_model': by, 'cost_usd_equiv': round((res or {}).get('total_cost_usd') or 0, 4),
        'fallback_credit': ((res or {}).get('usage') or {}).get('fallback_credit'),
        'tools': tools, 'ok': ok, 'check': note, 'diff': diff, 'subtype': (res or {}).get('subtype'), 'is_error': bool(failed),
        'timed_out': killed, 'exit_code': rc, 'limit_hit': limit, 'limit_text': text.strip()[:600] if (limit or failed) else '',
        'result_tail': ((res or {}).get('result') or '')[-600:], 'work': os.path.relpath(work, HERE),
    }

# ---------- the run ----------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--smoke', action='store_true', help='two tiny calls, one per model, to check the setup')
    ap.add_argument('--once', action='store_true', help='run each task once, then stop')
    ap.add_argument('--only', help='comma-separated task ids, run once each')
    ap.add_argument('--dry-run', action='store_true', help='print the plan and stop')
    ap.add_argument('--max-hours', type=float, default=5.5, help='stop after this much real time even without a limit (default 5.5)')
    ap.add_argument('--no-claude-md', action='store_true', help="don't copy hilma's CLAUDE.md into the workspaces")
    ap.add_argument('--bare', action='store_true', help='run the tasks without MCP servers or claude.ai connectors (smaller context on every call)')
    ap.add_argument('--opus-model', default=MODELS['opus']); ap.add_argument('--sonnet-model', default=MODELS['sonnet'])
    ap.add_argument('--claude', help='path to the claude binary')
    ap.add_argument('--yes', action='store_true', help="don't ask before starting on a window that is already in use")
    ap.add_argument('--allow-api', action='store_true', help="run even if Claude Code isn't on a subscription (it would bill the API)")
    ap.add_argument('--out', help='results folder (default results/<start time>)')
    args = ap.parse_args()

    spec = json.load(open(os.path.join(HERE, 'tasks.json')))
    by_id = {t['id']: t for t in spec['tasks']}
    models = {'opus': args.opus_model, 'sonnet': args.sonnet_model}
    if args.smoke: plan = [(SMOKE, 'sonnet'), (SMOKE, 'opus')]
    elif args.only: plan = [(by_id[i.strip()], by_id[i.strip()]['tier']) for i in args.only.split(',')]
    else: plan = [(by_id[i], by_id[i]['tier']) for i in spec['order']]
    repeat = not (args.smoke or args.only or args.once)
    if args.dry_run:
        for t, tier in plan: print('%-3s %-6s %-9s %s' % (t['id'], tier, t['kind'], t['title']))
        print('then the same order again' if repeat else 'once', '· stops at the plan limit or after %.1f h' % args.max_hours); return

    claude = find_claude(args.claude)
    env, dropped = child_env()
    root = os.path.abspath(args.out or os.path.join(HERE, 'results', time.strftime('%Y-%m-%d_%H%M%S') + ('_smoke' if args.smoke else '')))
    os.makedirs(root, exist_ok=True)
    awake = keep_awake(); hb = Heartbeat(os.path.join(root, 'heartbeat.jsonl')); hb.start()
    version = subprocess.run([claude, '--version'], capture_output=True, text=True).stdout.strip()
    log('Claude Code', version, '·', claude)
    if dropped: log('removed from the environment so the plan, not the API, is billed:', ', '.join(dropped))
    log('checking the clock against outside servers...')
    clock0 = net_time(); log('local clock vs servers (s):', clock0)
    m0 = meter(claude, env)
    log('plan meters:', {k: v['pct'] for k, v in m0['bars'].items()} or m0['text'][:300])
    if not m0['subscription'] and not args.allow_api:
        sys.exit('Claude Code does not report a subscription; this would bill the API. Log in with the plan (claude /login) or pass --allow-api.')
    s0 = bar(m0, 'session')
    if repeat and s0 and s0 > 0 and not args.yes:
        msg = 'The current 5-hour window is already %d%% used, so this run will measure only what is left of it.' % s0
        if sys.stdin.isatty():
            if input(msg + ' Start anyway? [y/N] ').strip().lower() != 'y': sys.exit('Stopped. Run again after the window resets.')
        else: log('WARNING:', msg)
    run = {'started': iso(time.time()), 'started_ts': time.time(), 'host': platform.node(), 'os': platform.platform(), 'claude_version': version,
           'claude_path': claude, 'models': models, 'claude_md': not args.no_claude_md, 'bare': args.bare, 'mode': 'smoke' if args.smoke else 'once' if not repeat else 'until-limit',
           'max_hours': args.max_hours, 'clock_start': clock0, 'meter_start': m0, 'env_dropped': dropped, 'node': bool(checks.NODE)}
    json.dump(run, open(os.path.join(root, 'run.json'), 'w'), indent=1)
    events_path = os.path.join(root, 'events.jsonl')
    log('results in', root)

    seq, stop, deadline = 0, None, time.time() + args.max_hours * 3600
    try:
        while not stop:
            for task, tier in plan:
                if time.time() > deadline: stop = 'max-hours reached without a limit'; break
                seq += 1
                log('#%d %s (%s, %s) %s ...' % (seq, task['id'], tier, models[tier], task['title']))
                ev = run_task(task, seq, tier, models[tier], args, claude, env, root)
                ev['meter_after'] = meter(claude, env)
                with open(events_path, 'a') as f: f.write(json.dumps(ev) + '\n')
                s, w = bar(ev['meter_after'], 'session'), bar(ev['meter_after'], 'week', 'all')
                log('   %s  %.1f min  %s tokens (out %s)  ~$%.2f eq  %s  · session %s%% · week %s%%' % (
                    'LIMIT' if ev['limit_hit'] else 'ok ' if ev['ok'] else 'FAIL', ev['wall_s'] / 60, '{:,}'.format(ev['tokens']['total']),
                    '{:,}'.format(ev['tokens']['output']), ev['cost_usd_equiv'], ev['check'], s, w))
                report.build(root)
                if ev['limit_hit']: stop = 'plan limit reached'; break
                if s is not None and s >= 100: stop = 'session meter at 100%'; break
                if ev['fallback_credit']: stop = 'the call used extra (paid) usage: stopped to avoid charges'; break
            if not repeat and not stop: stop = 'done'
    except KeyboardInterrupt:
        stop = 'stopped by hand (Ctrl-C)'
    finally:
        log('stopping:', stop, '· reading the meters and the clock once more...')
        run.update({'stopped': iso(time.time()), 'stopped_ts': time.time(), 'stop_reason': stop, 'clock_end': net_time(), 'meter_end': meter(claude, env)})
        json.dump(run, open(os.path.join(root, 'run.json'), 'w'), indent=1)
        hb.stop.set()
        if awake: awake.terminate()
        path = report.build(root)
        log('report:', path)

if __name__ == '__main__':
    main()
