// A reply cut off at the reply limit (OLA-470). From OLA-467, Nov 25, on the Studio: one reply of
// Ola's model spent 16,000 tokens (the reply limit in opencode.jsonc; thinking counts toward it) in
// 3 min 19 s and wrote no file; high thinking spent 32,000 tokens on a formula engine and wrote no
// code. Thinking Machines' advice for this model: limits on output tokens and turns. The limit
// stays; what changes is what happens when a reply hits it.
//
// Before: an unusable cut reply (nothing said and no tool call, or a tool call whose arguments end
// mid-way) was tried again unchanged, up to three times: the same three minutes three times over,
// and usually the same cut. Now:
//   - one more try, never more, with LENGTH_NOTE in the instructions (think briefly, write a long
//     file in parts), and for Ola's own model on our machine the thinking turned down to low for
//     that one reply (a rented model keeps its own setting);
//   - cut again: a failure the person sees, worded so the web app counts it as a budget problem
//     (steps.ts stuckReason: "too long") and offers the bigger model.
// A cut reply that still has text and no tool call goes through as it is (finish_reason length),
// as before: the web app counts those (steps.ts ESCALATE, OLA-479).

export const LENGTH_NOTE = 'Note from Ola’s gateway: your last reply reached the reply limit before it finished, and it was lost. Keep your thinking short this time and act. If you are writing a file, write it in parts: the first part now (at most about 250 lines) with the write tool, then add the rest with the edit tool in your next replies, one part per reply. If you were about to run a command, run it now.'

export const LENGTH_FAILED = 'Ola’s model wrote a reply too long for the reply limit twice, so this step was stopped'

/** Was this reply cut off at the reply limit with nothing usable in it? `wrong` is fault()'s answer. */
export function cutUnusable(choice, wrong) {
  if (choice?.finish_reason !== 'length') return false
  return wrong === 'an empty reply' || wrong === 'tool arguments that are not JSON'
}

/** The request for the one more try: the note in the instructions, and with `effort` thinking low. */
export function lengthRetry(body, withNote, { effort = false } = {}) {
  return { ...body, messages: withNote(body.messages, LENGTH_NOTE), ...(effort ? { reasoning_effort: 'low' } : {}) }
}
