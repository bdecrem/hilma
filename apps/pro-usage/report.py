#!/usr/bin/env python3
"""Turns a results folder into report.md and report.json.  python3 report.py results/<run>"""
import json, os, statistics, sys

def _load(root):
    run = json.load(open(os.path.join(root, 'run.json')))
    p = os.path.join(root, 'events.jsonl')
    events = [json.loads(l) for l in open(p)] if os.path.exists(p) else []
    return run, events

def _bar(m, *words):
    for k, v in ((m or {}).get('bars') or {}).items():
        if all(w in k.lower() for w in words): return v['pct']
    return None

def _resets(m, *words):
    for k, v in ((m or {}).get('bars') or {}).items():
        if all(w in k.lower() for w in words): return v.get('resets') or ''
    return ''

def _med(xs): xs = [x for x in xs if x is not None]; return statistics.median(xs) if xs else None
def _n(x): return '–' if x is None else '{:,}'.format(int(round(x)))
def _m(s): return '–' if s is None else '%.1f' % (s / 60)
def _hm(s):
    if s is None: return '–'
    if s < 60: return '%d s' % round(s)
    h, m = divmod(int(round(s / 60)), 60)
    return '%d h %02d min' % (h, m) if h else '%d min' % m
def _pct(x): return '–' if x is None else ('%g%%' % x)
def _usd(x): return '–' if x is None else '$%.2f' % x

def build(root):
    run, events = _load(root)
    m_start, m_end = run.get('meter_start'), run.get('meter_end') or (events[-1]['meter_after'] if events else None)
    # meter movement per task: compare each reading with the one before it
    prev = m_start
    for e in events:
        for key, words in [('d_session', ('session',)), ('d_week', ('week', 'all'))]:
            a, b = _bar(prev, *words), _bar(e.get('meter_after'), *words)
            e[key] = (b - a) if (a is not None and b is not None) else None
        prev = e.get('meter_after')
    done = [e for e in events if not e['limit_hit']]
    limit_ev = next((e for e in events if e['limit_hit']), None)
    t0 = events[0]['start_ts'] if events else run['started_ts']
    t_end = limit_ev['start_ts'] if limit_ev else (events[-1]['end_ts'] if events else run['started_ts'])
    real = t_end - t0
    tok = {k: sum(e['tokens'][k] for e in events) for k in ['input', 'output', 'cache_read', 'cache_write', 'total']}
    usd = sum(e['cost_usd_equiv'] for e in events)
    by_model = {}
    for e in events:
        for m, v in e['by_model'].items():
            d = by_model.setdefault(m, {'input': 0, 'output': 0, 'cache_read': 0, 'cache_write': 0, 'cost_usd': 0.0})
            for k in d: d[k] += v.get(k, 0)
    kinds = {}
    for e in done: kinds.setdefault(e['kind'], []).append(e)
    s0, s1 = _bar(m_start, 'session'), _bar(m_end, 'session')
    w0, w1 = _bar(m_start, 'week', 'all'), _bar(m_end, 'week', 'all')
    dw = (w1 - w0) if (w0 is not None and w1 is not None) else None
    ds = (s1 - s0) if (s0 is not None and s1 is not None) else None
    full_window = bool(limit_ev) or (s1 is not None and s1 >= 100)

    L = []
    L.append('# How far does the plan go?\n')
    L.append('Run started %s on %s · Claude Code %s · mode **%s** · %s\n' % (run['started'], run['host'], run['claude_version'], run['mode'],
             ('stopped: ' + run['stop_reason']) if run.get('stop_reason') else 'still running (this report is rewritten after every task)'))
    # ---- the answer ----
    L.append('## The answer\n')
    counts = ', '.join('%d %s' % (len(v), k) for k, v in sorted(kinds.items()))
    tiers = ', '.join('%d on %s' % (sum(1 for e in done if e['tier'] == t), t.capitalize()) for t in ['opus', 'sonnet'] if any(e['tier'] == t for e in done))
    if limit_ev:
        L.append('- **Continuous work hit the plan limit after %s of real time** (%s to %s).' % (_hm(real), events[0]['start'][11:16], limit_ev['start'][11:16]))
    else:
        L.append('- **No limit was hit**: %s of real time so far.' % _hm(real))
    L.append('- Finished **%d tasks** in that time: %s (%s); %d passed their check.' % (len(done), counts or 'none', tiers or '–', sum(1 for e in done if e['ok'])))
    L.append('- Tokens: **%s in all**: %s output, %s input, %s read from cache, %s written to cache. At API prices that is **%s**.' % (
        _n(tok['total']), _n(tok['output']), _n(tok['input']), _n(tok['cache_read']), _n(tok['cache_write']), _usd(usd)))
    if ds is not None: L.append('- The 5-hour meter went from %s to %s%s.' % (_pct(s0), _pct(s1), ('; it resets ' + _resets(m_end, 'session')) if _resets(m_end, 'session') else ''))
    if done and ds:
        L.append('- 1%% of a 5-hour window ≈ %s tokens (%s output) ≈ %.1f real minutes of this work.' % (_n(tok['total'] / ds), _n(tok['output'] / ds), real / 60 / ds))
    # ---- the week ----
    L.append('\n## The week\n')
    if dw is None:
        L.append('The weekly meter could not be read at both ends of the run.')
    elif dw <= 0:
        L.append('The weekly meter did not move (%s → %s): the run was too short to read. It reads in whole percents.' % (_pct(w0), _pct(w1)))
    else:
        wk_windows = 100 / dw
        L.append('- The weekly meter (all models) went from %s to %s: this run used **%g%% of the week**.' % (_pct(w0), _pct(w1), dw))
        if full_window:
            L.append('- So a week holds about **%.1f windows like this one**: about **%s of continuous work** a week, then the weekly cap stops you even if a 5-hour window is open.' % (wk_windows, _hm(real * wk_windows)))
        else:
            L.append('- At this rate the weekly cap allows about **%s of this work** a week.' % _hm(real * wk_windows))
        L.append('- A week ≈ %s tokens (%s output), %s at API prices; a month (4.35 weeks) ≈ %s tokens, %s.' % (
            _n(tok['total'] * wk_windows), _n(tok['output'] * wk_windows), _usd(usd * wk_windows), _n(tok['total'] * wk_windows * 4.35), _usd(usd * wk_windows * 4.35)))
        if done:
            L.append('- In tasks, a week holds about: ' + ', '.join('%.0f %s' % (len(v) * wk_windows, k) for k, v in sorted(kinds.items())) + ' tasks of the kinds in this mix.')
        L.append('- The meter has whole-percent steps: with %g points of movement the weekly figures are good to about ±%d%%.' % (dw, round(100 / dw)))
    other = [(k, v['pct']) for k, v in ((m_end or {}).get('bars') or {}).items() if 'week' in k.lower() and 'all' not in k.lower()]
    for k, v in other:
        a = ((m_start or {}).get('bars') or {}).get(k, {}).get('pct')
        L.append('- %s: %s → %s.' % (k, _pct(a), _pct(v)))
    # ---- time ----
    L.append('\n## Real time\n')
    in_tasks = sum(e['wall_s'] for e in events)
    reported = sum(e['claude_duration_s'] for e in events)
    api = sum(e['api_duration_s'] for e in events)
    meters = sum((e.get('meter_after') or {}).get('seconds', 0) for e in events)
    L.append('Measured by this script from the computer clock (not by the model): each task from the moment its `claude` call starts to the moment it exits.\n')
    L.append('| | |\n|---|---|\n| Start of first task to %s | %s |\n| Inside tasks | %s |\n| Reading the meters between tasks | %s |\n| Claude Code\'s own count of its run time | %s |\n| Time spent waiting on the model API | %s |' % (
        'the limit' if limit_ev else 'end of last task', _hm(real), _hm(in_tasks), _hm(meters), _hm(reported), _hm(api)))
    c0, c1 = run.get('clock_start') or {}, run.get('clock_end') or {}
    offs = [v for v in list(c0.values()) + list(c1.values()) if isinstance(v, (int, float))]
    L.append('\nThe computer clock agreed with outside servers to within %s s at the start and end (%s).' % (max((abs(v) for v in offs), default='–'), ', '.join(sorted({u.split('//')[1] for u in c0})) or 'not checked'))
    hb = os.path.join(root, 'heartbeat.jsonl')
    if os.path.exists(hb):
        beats = [json.loads(l)['t'] for l in open(hb) if l.strip()]
        gaps = [b - a for a, b in zip(beats, beats[1:])]
        g = max(gaps) if gaps else 0
        L.append('A heartbeat written every 20 s shows %s (longest gap %.0f s).' % ('the machine stayed awake throughout' if g < 60 else '**a gap of %.0f s: the machine may have slept, so real time is overstated by about that much**' % g, g))
    # ---- by kind / model / task ----
    L.append('\n## By kind of work\n')
    L.append('| kind | runs | passed | real min (median) | real min (total) | tokens (median) | output (median) | API $ eq (median) | 5-h meter per task (median) |\n|---|---|---|---|---|---|---|---|---|')
    for k, es in sorted(kinds.items()):
        L.append('| %s | %d | %d | %s | %s | %s | %s | %s | %s |' % (k, len(es), sum(1 for e in es if e['ok']), _m(_med([e['wall_s'] for e in es])), _m(sum(e['wall_s'] for e in es)),
                 _n(_med([e['tokens']['total'] for e in es])), _n(_med([e['tokens']['output'] for e in es])), _usd(_med([e['cost_usd_equiv'] for e in es])), _pct(_med([e['d_session'] for e in es]))))
    L.append('\n## By model\n')
    L.append('| model | tasks | real min | input | output | cache read | cache write | API $ eq |\n|---|---|---|---|---|---|---|---|')
    for m, v in sorted(by_model.items(), key=lambda kv: -kv[1]['cost_usd']):
        es = [e for e in events if e['model'] == m]
        L.append('| %s | %s | %s | %s | %s | %s | %s | %s |' % (m, len(es) or '(helper)', _m(sum(e['wall_s'] for e in es)) if es else '–', _n(v['input']), _n(v['output']), _n(v['cache_read']), _n(v['cache_write']), _usd(v['cost_usd'])))
    L.append('\nClaude Code also calls a small model for housekeeping (titles, summaries); it shows up here as a helper.\n')
    L.append('## By task\n')
    L.append('| task | model | runs | passed | real min (median) | tokens (median) | output (median) | 5-h meter (median) |\n|---|---|---|---|---|---|---|---|')
    ids = []
    for e in events:
        if e['id'] not in ids: ids.append(e['id'])
    for i in ids:
        es = [e for e in done if e['id'] == i]; any_e = next(e for e in events if e['id'] == i)
        L.append('| %s %s | %s | %d | %d | %s | %s | %s | %s |' % (i, any_e['title'], any_e['tier'], len(es), sum(1 for e in es if e['ok']), _m(_med([e['wall_s'] for e in es])),
                 _n(_med([e['tokens']['total'] for e in es])), _n(_med([e['tokens']['output'] for e in es])), _pct(_med([e['d_session'] for e in es]))))
    L.append('\n## Every call\n')
    L.append('| # | start | task | model | real min | tokens | output | API $ eq | 5-h meter | week | result |\n|---|---|---|---|---|---|---|---|---|---|---|')
    for e in events:
        res = 'LIMIT' if e['limit_hit'] else ('pass' if e['ok'] else 'fail: ' + e['check']) + (' (timed out)' if e['timed_out'] else '')
        L.append('| %d | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |' % (e['seq'], e['start'][11:19], e['id'], e['tier'], _m(e['wall_s']), _n(e['tokens']['total']), _n(e['tokens']['output']),
                 _usd(e['cost_usd_equiv']), _pct(_bar(e.get('meter_after'), 'session')), _pct(_bar(e.get('meter_after'), 'week', 'all')), res))
    if limit_ev:
        L.append('\nWhat Claude Code said when the limit hit:\n\n```\n%s\n```' % limit_ev['limit_text'][:600])
    L.append('\n## Setup\n')
    L.append('- Models: %s. CLAUDE.md in every workspace: %s (hilma\'s, about 16k tokens, as in real sessions). MCP servers and connectors: %s. node for the checks: %s.' % (
        ', '.join('%s = %s' % kv for kv in run['models'].items()), 'yes' if run['claude_md'] else 'no', 'off (--bare)' if run.get('bare') else "the machine's own", 'yes' if run.get('node') else 'no'))
    first = events[0] if events else None
    if first:
        L.append('- Context every call starts with (system prompt, CLAUDE.md files, tool lists), from the first call\'s cache: about %s tokens.' % _n(first['tokens']['cache_read'] + first['tokens']['cache_write']))
    L.append('- Meters at the start: ' + (', '.join('%s %s' % (k, _pct(v['pct'])) for k, v in ((m_start or {}).get('bars') or {}).items()) or 'unreadable'))
    if run.get('env_dropped'): L.append('- Removed from the environment so the plan was billed, not the API: ' + ', '.join(run['env_dropped']))
    L.append('- Every task ran in a fresh copy of fixture/ under work/; its full Claude Code stream is in `.claude-stream.jsonl` there.')
    path = os.path.join(root, 'report.md')
    open(path, 'w').write('\n'.join(L) + '\n')
    json.dump({'run': run, 'real_seconds': real, 'tasks_done': len(done), 'tokens': tok, 'cost_usd_equiv': usd, 'by_model': by_model,
               'session_meter': [s0, s1], 'week_meter': [w0, w1], 'limit_hit': bool(limit_ev), 'events': events}, open(os.path.join(root, 'report.json'), 'w'), indent=1)
    return path

if __name__ == '__main__':
    if len(sys.argv) < 2: sys.exit(__doc__)
    print(build(sys.argv[1]))
