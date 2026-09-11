// PATCH /api/f2/live/session/:id — finish a voice session (transcript,
// summary, usage). Same handler as the Realtime-era path; the row is
// model-agnostic.
export { PATCH } from '../../../realtime/session/[id]/route'
export const runtime = 'nodejs'
