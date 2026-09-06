// Jambot for the browser — entry point for the esbuild bundle that lands in
// public/jam/jambot-web.js. Everything below comes straight from
// ../vibeceo/jambot (the CLI's own code); only the pieces that need the
// file system or sox are left out, and `render` returns an AudioBuffer
// instead of writing a WAV.
//
// Rebuild with: pnpm jam:build

import { createSession, serializeSession, deserializeSession } from '../../../vibeceo/jambot/core/session.js';
import { renderSessionToBuffer } from '../../../vibeceo/jambot/core/render.js';
import { runAgent as runAgentCore } from '../../../vibeceo/jambot/core/agent.js';
import {
  buildSessionContext, describeSession, readProducerValue, formatProducerValue,
} from '../../../vibeceo/jambot/core/status.js';
import { detectGenres, buildGenreContext } from '../../../vibeceo/jambot/core/library.js';
import { audioBufferToWav } from '../../../vibeceo/jambot/core/wav.js';
import { initializeTools, executeTool, registerTool, getToolNames } from '../../../vibeceo/jambot/tools/index.js';
import { TOOLS } from '../../../vibeceo/jambot/tools/tool-definitions.js';
import JAMBOT_PROMPT from '../../../vibeceo/jambot/JAMBOT-PROMPT.md';

// Tool modules that work without fs/sox. Left out: jbs-tools (kits on disk),
// analyze-tools (sox), render-tools (writes WAVs; replaced below).
const WEB_TOOL_MODULES = [
  () => import('../../../vibeceo/jambot/tools/session-tools.js'),
  () => import('../../../vibeceo/jambot/tools/jb202-tools.js'),
  () => import('../../../vibeceo/jambot/tools/jb01-tools.js'),
  () => import('../../../vibeceo/jambot/tools/mixer-tools.js'),
  () => import('../../../vibeceo/jambot/tools/song-tools.js'),
  () => import('../../../vibeceo/jambot/tools/generic-tools.js'),
  () => import('../../../vibeceo/jambot/tools/jp9000-tools.js'),
  () => import('../../../vibeceo/jambot/tools/jt-tools.js'),
  () => import('../../../vibeceo/jambot/tools/automation-tools.js'),
  () => import('../../../vibeceo/jambot/tools/routing-tools.js'),
  () => import('../../../vibeceo/jambot/tools/instrument-tools.js'),
];

// Tools that exist in the modules above but make no sense in the browser.
const HIDDEN_TOOLS = new Set([
  'rename_project', 'list_projects', 'open_project',
  'save_jp9000_rig', 'load_jp9000_rig', 'list_jp9000_rigs',
  'create_jbs_kit',
]);

/** Same ceiling as `tweak({ path: 'bars' })` and the Controls sheet. A 300-bar
 * render is ~200 MB of float audio — enough to kill a phone tab. */
export const MAX_RENDER_BARS = 128;

/**
 * Bars for a loop-mode render: the requested count (else session.bars, else
 * 2), never shorter than the longest programmed pattern — a 4-bar drum fill
 * must be heard whole, not cut at session.bars — and clamped to
 * 1..MAX_RENDER_BARS. Arrangements set their own length inside render.js, so
 * this is ignored there.
 * @returns {{ bars: number, longest: number, longestId: string|null }}
 */
export function resolveRenderBars(session, requested) {
  const asked = Number(requested);
  const base = Number.isFinite(asked) && asked > 0 ? asked : (Number(session?.bars) || 2);

  let longest = 0;
  let longestId = null;
  const active = describeSession(session).instruments.filter(i => i.active);
  for (const inst of active) {
    const node = typeof session.getNode === 'function' ? session.getNode(inst.id) : session._nodes?.[inst.id];
    const n = typeof node?.getPatternBars === 'function' ? Math.ceil(node.getPatternBars()) : 0;
    if (Number.isFinite(n) && n > longest) { longest = n; longestId = inst.id; }
  }

  const bars = Math.min(MAX_RENDER_BARS, Math.max(1, Math.round(Math.max(base, longest))));
  return { bars, longest, longestId };
}

/** Browser render tool: renders to an AudioBuffer, hands it to the host. */
registerTool('render', async (input, session, context) => {
  const hasArrangement = Array.isArray(session.arrangement) && session.arrangement.length > 0;
  const { bars, longest, longestId } = resolveRenderBars(session, input?.bars);
  const result = await renderSessionToBuffer(session, bars);
  session.lastRender = { bars: result.bars, bpm: session.bpm, at: Date.now() };
  context.onRender?.({ ...result, bpm: session.bpm });

  let message = result.message;
  if (!hasArrangement) {
    const asked = Number(input?.bars);
    const wanted = Number.isFinite(asked) && asked > 0 ? asked : (Number(session.bars) || 2);
    if (bars === longest && longest > wanted) message += ` (${longest} bars to fit the ${longestId} pattern)`;
    else if (wanted > MAX_RENDER_BARS) message += ` (capped at ${MAX_RENDER_BARS} bars)`;
  }
  return message;
});

let toolsReady = null;
let WEB_TOOLS = null;

/** Resolve the tool schema list once tool modules are loaded. */
export async function ready() {
  if (!toolsReady) {
    toolsReady = initializeTools(WEB_TOOL_MODULES).then(() => {
      const names = new Set(getToolNames());
      WEB_TOOLS = TOOLS
        .filter(t => names.has(t.name) && !HIDDEN_TOOLS.has(t.name))
        .map(t => t.name === 'render'
          ? {
              ...t,
              description: 'Render the current session so the user can hear it. Call this after every change to the track. If an arrangement is set, renders the full song; otherwise renders the current patterns for the given number of bars (at least as long as the longest pattern, at most 128).',
              input_schema: { type: 'object', properties: { bars: { type: 'number', description: 'Bars to render, 1-128 (default: session bars, ignored if arrangement is set)' } }, required: [] },
            }
          : t);
    });
  }
  await toolsReady;
  return WEB_TOOLS;
}

/** The /api/jam/llm route caps max_tokens at 16384; Opus 5's adaptive thinking
 * shares that budget with the reply, and a 16-section set_arrangement plus a
 * few 16-step patterns overran the loop's 8192 default. */
export const WEB_MAX_TOKENS = 16384;

/** The core loop with the web's max_tokens default; callers may still override. */
export function runAgent(opts) {
  return runAgentCore({ maxTokens: WEB_MAX_TOKENS, ...opts });
}

export const WEB_PROMPT_ADDENDUM = `

## WEB APP CONTEXT

You are running inside the Jam web app on the user's phone or laptop.
- The app plays back the most recent \`render\` automatically. After you change anything that affects the sound, call \`render\` so the user hears the new version. One render per turn, at the end, is enough.
- The user also has on-screen sliders (BPM, swing, bars, instrument levels, voice and filter parameters). Changes they make there are reported to you as "[controls] ..." notes inside their message. Treat them as facts about the current session — don't undo them unless asked.
- Not available here: the sampler (jbs), audio analysis tools, projects, rig files. Don't offer them.
- Keep replies to one or two short sentences. The user is reading on a phone.`;

export {
  createSession, serializeSession, deserializeSession,
  renderSessionToBuffer, executeTool,
  buildSessionContext, describeSession, readProducerValue, formatProducerValue,
  detectGenres, buildGenreContext, audioBufferToWav,
  JAMBOT_PROMPT,
};

export const VERSION = __JAM_BUILD__;
