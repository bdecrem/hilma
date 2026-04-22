// Feynd topic registry. A topic owns a persona prompt, a list of courses
// that belong to it, and a source pool in the feynd_sources table (loaded
// at runtime). The Chat tab defaults to 'ai-learning'; course chats infer
// their topic from the course id.

export type FeyndTopic = {
  id: string
  name: string
  persona: string          // system prompt prefix for this topic
  courses: string[]        // course ids owned by this topic
}

export const TOPICS: Record<string, FeyndTopic> = {
  'ai-learning': {
    id: 'ai-learning',
    name: 'AI Learning',
    // Topic personas are narrow — just the DOMAIN framing. The teaching
    // style (chunking, audience, prose format) lives in FEYND_TEACHING_PERSONA
    // and is shared across every topic.
    persona:
      'Domain: modern AI. You are teaching how today\'s frontier LLM systems (Claude Opus, GPT, Gemini, Llama, DeepSeek, Kimi) are actually built in 2025–2026. Be willing to get specific — model names, versions, numbers, procedural steps. Show how things really work, not a sanitized surface.',
    courses: ['frontier-ai-2026'],
  },
}

export function getTopic(id: string): FeyndTopic | null {
  return TOPICS[id] ?? null
}

export function topicForCourse(courseId: string): string {
  for (const t of Object.values(TOPICS)) {
    if (t.courses.includes(courseId)) return t.id
  }
  return 'ai-learning'
}

export const DEFAULT_TOPIC = 'ai-learning'
