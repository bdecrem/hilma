// PLACEHOLDER — stage 2a writes the real bridge.
//
// Owns one `session` (a JamSession from the jambot-web.js bundle loaded
// alongside this file) and answers Swift's calls via:
//
//   window.webkit.messageHandlers.engine.postMessage({ id, ok, result | error })
//
// Swift calls in with `bridge.call(id, name, argsJSON)`. See the call table
// in ../../DESIGN.md ("Engine host bridge") for the full list of `name`
// values, their args, and their results — ready, loadSession, serialize,
// describe, controls, tweak, setTrack, mix, render, agent.
//
// The `controls` call is a port of src/app/jam/controls.ts
// (buildControlGroups) to plain JS — keep the two in sync by hand since this
// file can't import TypeScript.
//
// The `agent` call does NOT fetch the LLM itself: it posts
// `{ id, event: 'llm', request }` and awaits `bridge.resolveLlm(id, responseJSON)`
// from Swift, which performs the actual POST to /api/jam/llm with the
// session cookie (the web view never talks to the network).

window.bridge = {
  call(id, name, argsJSON) {
    window.webkit.messageHandlers.engine.postMessage({
      id,
      ok: false,
      error: `engine-bridge.js placeholder — '${name}' not implemented yet (stage 2a)`,
    })
  },
  resolveLlm(id, responseJSON) {
    // stage 2a: resolve the pending llm continuation for `id`
  },
}
