"""Sort papers into buckets with Claude, one call per paper; the answers land in gami.db (tables runs, labels).
usage: python3 classify.py --name adaptation-type \
         --bucket "infrastructure: seawalls, dams, irrigation, buildings" --bucket "behavioural: ..." [...] \
         [--question "extra instruction"] [--source full|summary] [--where "SQL on papers"] [--limit 20] [--model ...]
Every paper also may get "none". --source full (default) sends the whole paper; summary sends title + GAMI summary.
Rerunning the same --name skips papers already labelled, so an interrupted run picks up where it stopped.
Results: select label, count(*) from labels where run='adaptation-type' group by label;
"""
import argparse, json, os, re, sqlite3, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
GAMI = Path(os.environ.get('GAMI_DIR', Path.home() / 'GAMI'))
ap = argparse.ArgumentParser()
ap.add_argument('--name', required=True); ap.add_argument('--bucket', action='append', required=True)
ap.add_argument('--question', default=''); ap.add_argument('--source', choices=['full', 'summary'], default='full')
ap.add_argument('--where', default='1=1'); ap.add_argument('--limit', type=int)
ap.add_argument('--model', default='claude-sonnet-5-5'); ap.add_argument('--workers', type=int, default=8)
a = ap.parse_args()

def key():
    if os.environ.get('ANTHROPIC_API_KEY'): return os.environ['ANTHROPIC_API_KEY']
    for f in (GAMI / '.env', Path.home() / 'Documents/code/hilma/.env.local'):
        if f.exists():
            m = re.search(r'^ANTHROPIC_API_KEY=["\']?([^"\'\s]+)', f.read_text(), re.M)
            if m: return m.group(1)
    sys.exit('no ANTHROPIC_API_KEY')
KEY = key()
names = [b.split(':', 1)[0].strip() for b in a.bucket]
db = sqlite3.connect(GAMI / 'gami.db', check_same_thread=False)
db.execute('INSERT OR REPLACE INTO runs VALUES (?,?,?,?,?,?)', (a.name, time.strftime('%Y-%m-%d %H:%M'), a.model, a.source, a.question, json.dumps(a.bucket)))
db.commit()
sql = f"select id, title, summary, body from papers where ({a.where}) and id not in (select paper_id from labels where run=?)"
if a.source == 'full': sql += ' and body is not null'
rows = db.execute(sql + (f' limit {a.limit}' if a.limit else ''), (a.name,)).fetchall()
words = sum(len(((r[3] if a.source == 'full' else '') or '').split()) + len((r[2] or '').split()) for r in rows)
print(f'{len(rows)} papers, ~{words * 1.4 / 1e6:.1f}M input tokens, model {a.model}', flush=True)

SYSTEM = ('You sort climate-adaptation research papers into categories for a literature review. Read the paper and pick the one '
          'category that fits best, or "none" if no category fits. Judge from what the paper actually studies, not from passing mentions. '
          'Categories:\n' + '\n'.join(f'- {b}' for b in a.bucket) + (f'\n\nInstruction: {a.question}' if a.question else ''))
SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': ['label', 'confidence', 'reason'], 'properties': {
    'label': {'type': 'string', 'enum': names + ['none']}, 'confidence': {'type': 'string', 'enum': ['high', 'medium', 'low']},
    'reason': {'type': 'string', 'description': 'one sentence, citing what in the paper decided it'}}}

def call(r):
    pid, title, summary, body = r
    doc = f'Title: {title}\n\nDatabase summary: {summary or "(none)"}' + (f'\n\nFull text:\n{body}' if a.source == 'full' else '')
    payload = {'model': a.model, 'max_tokens': 4000, 'system': SYSTEM, 'messages': [{'role': 'user', 'content': doc}],
               'output_config': {'effort': 'low', 'format': {'type': 'json_schema', 'schema': SCHEMA}}}
    for attempt in range(6):
        req = urllib.request.Request('https://api.anthropic.com/v1/messages', json.dumps(payload).encode(),
                                     {'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'})
        try:
            res = json.load(urllib.request.urlopen(req, timeout=300))
            if res.get('stop_reason') not in ('end_turn', 'stop_sequence'): raise ValueError(f"stop_reason {res.get('stop_reason')}")
            return pid, json.loads(next(b['text'] for b in res['content'] if b['type'] == 'text'))
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:300]
            if e.code in (429, 500, 502, 503, 529): time.sleep(2 ** attempt * 5); continue
            return pid, {'error': f'{e.code} {msg}'}
        except Exception as e:
            if attempt < 2: time.sleep(5); continue
            return pid, {'error': str(e)}
    return pid, {'error': 'gave up after retries'}

done = errs = 0
with ThreadPoolExecutor(a.workers) as ex:
    for f in as_completed([ex.submit(call, r) for r in rows]):
        pid, out = f.result()
        if 'error' in out: errs += 1; print(pid, out['error'], file=sys.stderr); continue
        db.execute('INSERT OR REPLACE INTO labels VALUES (?,?,?,?,?)', (a.name, pid, out['label'], out['confidence'], out['reason'])); db.commit()
        done += 1
        if done % 25 == 0: print(f'{done}/{len(rows)}', flush=True)
print(f'done: {done} labelled, {errs} errors')
for lab, n in db.execute('select label, count(*) from labels where run=? group by label order by 2 desc', (a.name,)): print(f'  {n:5}  {lab}')
