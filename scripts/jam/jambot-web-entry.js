// Jambot for the browser — entry point for the esbuild bundle that lands in
// public/jam/jambot-web.js. Everything below comes straight from
// ../vibeceo/jambot (the CLI's own code); only the pieces that need the
// file system or sox are left out, and `render` returns an AudioBuffer
// instead of writing a WAV.
//
// Rebuild with: pnpm jam:build

import { createSession, serializeSession, deserializeSession } from '../../../vibeceo/jambot/core/session.js';
import { renderSessionToBuffer } from '../../../vibeceo/jambot/core/render.js';
import { runAgent } from '../../../vibeceo/jambot/core/agent.js';
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
];

// Tools that exist in the modules above but make no sense in the browser.
const HIDDEN_TOOLS = new Set([
  'rename_project', 'list_projects', 'open_project',
  'save_jp9000_rig', 'load_jp9000_rig', 'list_jp9000_rigs',
  'create_jbs_kit',
]);

/** Browser render tool: renders to an AudioBuffer, hands it to the host. */
registerTool('render', async (input, session, context) => {
  const bars = input?.bars || session.bars || 2;
  const result = await renderSessionToBuffer(session, bars);
  session.lastRender = { bars: result.bars, bpm: session.bpm, at: Date.now() };
  context.onRender?.({ ...result, bpm: session.bpm });
  return result.message;
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
              description: 'Render the current session so the user can hear it. Call this after every change to the track. If an arrangement is set, renders the full song; otherwise renders the current patterns for the given number of bars.',
              input_schema: { type: 'object', properties: { bars: { type: 'number', description: 'Bars to render (default: session bars, ignored if arrangement is set)' } }, required: [] },
            }
          : t);
    });
  }
  await toolsReady;
  return WEB_TOOLS;
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
  renderSessionToBuffer, runAgent, executeTool,
  buildSessionContext, describeSession, readProducerValue, formatProducerValue,
  detectGenres, buildGenreContext, audioBufferToWav,
  JAMBOT_PROMPT,
};

export const VERSION = __JAM_BUILD__;
