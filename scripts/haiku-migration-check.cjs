// Run actual function bodies in a VM with API and database doubles; no credentials/network.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, names, context) {
    const source = fs.readFileSync(path.join(root, file), 'utf8'), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const nodes = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text));
    assert.equal(nodes.length, names.length, file);
    const code = ts.transpileModule(nodes.map(n => n.getText(ast)).join('\n'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const scope = vm.createContext({ exports: {}, console: { log() { }, error() { } }, ...context });
    vm.runInContext(code, scope);
    return scope;
}
const completedText = load('src/lib/anthropic-response.ts', ['completedText'], {}).completedText;
const response = (text, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'thinking', signature: 'opaque' }, { type: 'text', text }] });
assert.equal(completedText({ stop_reason: 'end_turn', content: [{ type: 'thinking' }, { type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }), 'ab');
for (const stop of ['refusal', 'max_tokens', 'tool_use', 'pause_turn', null])
    assert.throws(() => completedText(response('valid-looking text', stop)), /did not complete/);
assert.throws(() => completedText(response('')), /no text/);
assert.equal(completedText(response(''), true), '');
const cases = [
    ['src/lib/f2/name-topic.ts', 'nameTopic', [{ body: 'Some content' }], 'Orbital Mechanics', 'fallback', ['cleanTitle']],
    ['src/lib/f2/videos.ts', 'planSearch', ['space', '2026-10-08', {}], '{"topicTitle":"Space","queries":["space"],"criteria":"clear"}', 'fallback'],
    ['src/lib/f3/primer.ts', 'generatePrimer', [{}], '{"questions":["Why?","How?","When?"]}'],
    ['src/lib/f3/recall-grader.ts', 'gradeRecall', [{ prompt: 'Q', canonicalAnswer: 'A', userAnswer: 'A' }], '{"grade":2,"feedback":"Right"}'],
    ['src/lib/f2/flash.ts', 'judgeJson', ['system', 'user', {}], '{"accepted":true}'],
    ['src/lib/osai/memory.ts', 'updateNotes', ['bart', 'old note', 'question', 'reply'], 'new note', 'memory'],
    ['src/lib/jam/taste.ts', 'classify', [{ asked: 'q', calls: [], reply: 'r', now: 'n' }], '{"kind":"correction","strength":2,"reason":"quieter","targets":[]}'],
    ['src/app/api/nowwhat/gen2/words/route.ts', 'callHaiku', ['key', 'system', 'prompt'], '["tree"]'],
    ['scripts/nowwhat-gen2.ts', 'callAnthropic', ['claude-haiku-5-5', 'system', 'prompt'], '{"grid":[]}'],
    ['scripts/backfill-open-questions.mjs', 'judgeBatch', [[{ question: 'Q', answer: 'A' }]], '{"verdicts":[{"index":0,"open_question":null}]}'],
    ['scripts/quiz-me/classify-explainers.mjs', 'classify', [{}], '{"is_explainer":true,"topic":"Gravity","reason":"Explains gravity"}'],
    ['apps/macplus/agent-voice/server.mjs', 'writeLine', ['hello'], 'Hello from your Macintosh.'],
    ['scripts/moltbook.ts', 'solveChallenge', ['how many lobsters: 2 + 2'], '4.00'],
    ['src/app/api/nowwhat/gen2/route.ts', 'POST', [], JSON.stringify({ name: 'Shape', grid: Array.from({ length: 10 }, () => Array(26).fill(1)) }), 'route'],
    ['src/app/api/nowwhat/judge/route.ts', 'POST', [{ json: async () => ({ grid: Array.from({ length: 10 }, () => Array(26).fill(1)) }) }], '{"accept":true,"name":"Tree","reason":"Recognizable"}', 'route'],
];
(async () => {
    let requests = 0;
    for (const [file, fn, args, text, mode, extra = []] of cases) {
        for (const stop of ['end_turn', 'refusal', 'max_tokens']) {
            let captured, writes = 0;
            const result = response(text, stop);
            const create = async (params) => { captured = params; requests++; return result; };
            const client = Object.assign(() => ({ messages: { create } }), { messages: { create } });
            const context = { completedText, MODEL: 'claude-haiku-5-5', JUDGE_MODEL: 'claude-haiku-5-5', MINER_MODEL: 'claude-haiku-5-5', PLAN_MODEL: 'claude-haiku-5-5', MEMORY_MODEL: 'claude-haiku-5-5', anthropic: client, client,
                SAMPLE_CHARS: 4000, INSTRUCTION: 'Name it', MAX_SOURCE_CHARS: 30000, PRIMER_SCHEMA: {}, GRADE_SCHEMA: {}, SYSTEM: 'system', MINER_SYSTEM: 'system', FULL_NAME: { bart: 'Bart' },
                buildFullContent: () => 'Source content', planSystem: () => 'System', extractJson: JSON.parse, squash: (s, n) => s.slice(0, n), setNotes: async () => { writes++; }, preview: () => 'Conversation',
                ANTHROPIC_API_URL: 'https://example.invalid', anthropicKey: 'dummy', getApiKey: () => 'dummy', getAnthropicKey: () => 'dummy', process: { env: { ANTHROPIC_API_KEY: 'dummy' } },
                fetch: async (_url, init) => { captured = JSON.parse(init.body); requests++; return { ok: true, json: async () => result }; }, state: { since: null }, latestPrompt: () => 'Hello', recent: [], COLS: 26, ROWS: 10, lastCallAt: 0, MIN_INTERVAL: 8000, pickConcept: async () => 'shape', fillPercent: () => 30,
                NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) }, readPool: async () => ({ totalEvaluated: 0, totalAccepted: 0, winners: [] }), writePool: async () => { writes++; }, sonnetReview: async () => ({ approved: true, reason: 'yes' }) };
            const scope = load(file, [fn, ...extra], context);
            let value, error;
            try {
                value = await scope[fn](...args);
            }
            catch (e) {
                error = e;
            }
            assert.ok(captured, `${file}: request must execute (${error?.message})`);
            assert.equal(captured.model, 'claude-haiku-5-5');
            assert.equal(captured.output_config.effort, 'low');
            assert.ok(captured.max_tokens >= 2048);
            assert.equal(captured.messages.at(-1).role, 'user');
            for (const p of ['temperature', 'top_p', 'top_k'])
                assert.equal(captured[p], undefined);
            if (stop === 'end_turn') {
                assert.equal(error, undefined, `${file}: ${error?.stack}`);
                assert.notEqual(value, null);
                if (mode === 'memory')
                    assert.equal(writes, 1);
            }
            else {
                assert.equal(writes, 0, `${file}: incomplete output must not write`);
                if (mode === 'memory')
                    assert.equal(error, undefined);
                else if (mode === 'fallback')
                    assert.equal(value, null);
                else if (mode === 'route')
                    assert.ok(value.status >= 400 || value.body.accept === false, file);
                else
                    assert.ok(error, `${file}: must reject ${stop}`);
            }
        }
        console.log(`PASS ${file} :: ${fn} (thinking-first, refusal, truncation)`);
    }
    console.log(`PASS response block/empty checks; ${cases.length} call sites, ${requests} mocked requests; no network or production writes.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
