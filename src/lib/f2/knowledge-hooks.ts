// "This topic's material just changed" → refresh its knowledge index (digest +
// embedded chunks, src/lib/f2/knowledge.ts) once the response has gone out.
// Best effort by design: a route with a short maxDuration may be cut off
// mid-index, and scripts run outside any request — in both cases the topic
// simply stays stale until the next catch-up (opening the global chat, or the
// nightly /api/f2/knowledge/backfill), which compares material hashes.
export function scheduleTopicIndex(threadId: string, userId: string): void {
  void (async () => {
    try {
      const { after } = await import('next/server')
      after(async () => {
        try {
          const [{ indexTopic }, { getThreadById }] = await Promise.all([
            import('./knowledge'),
            import('./threads'),
          ])
          const thread = await getThreadById(userId, threadId)
          if (thread) await indexTopic(thread)
        } catch (err) {
          console.error('[f2/knowledge] scheduled index failed:', threadId, err)
        }
      })
    } catch {
      // Not inside a request (a script, a test): the catch-up pass covers it.
    }
  })()
}
