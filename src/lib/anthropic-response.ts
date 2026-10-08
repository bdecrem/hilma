/** Read a completed text response without mistaking reasoning for output.
 * Refusals and truncated JSON must never become a title, grade, or saved note.
 */
export function completedText(response: {
  stop_reason?: string | null
  content?: ReadonlyArray<{ type: string; text?: string }>
}, allowEmpty = false): string {
  if (response.stop_reason !== 'end_turn' && response.stop_reason !== 'stop_sequence') {
    throw new Error(`Anthropic response did not complete: ${response.stop_reason ?? 'missing stop_reason'}`)
  }
  const text = (response.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
    .trim()
  if (!text && !allowEmpty) throw new Error('Anthropic response contained no text')
  return text
}
