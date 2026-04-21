import courseJson from '@/data/feynd/frontier-ai-2026.json'

type Transcript = { status: string; language?: string | null; text: string }
type Video = {
  id: string
  order: number
  title: string
  author: string
  host: string
  publishedOn: string
  durationMin: number
  youtubeId: string
  url: string
  blurb: string
  concepts: string[]
  transcript: Transcript
}
type Concept = { id: string; group: string; label: string }
type Course = {
  id: string
  title: string
  subtitle: string
  description: string
  estimatedHours: number
  accentHex: string
  concepts: Concept[]
  videos: Video[]
}

const COURSE = courseJson as unknown as Course

export const FEYND_COURSES: Record<string, Course> = {
  [COURSE.id]: COURSE,
}

export function getCourse(courseId: string): Course | null {
  return FEYND_COURSES[courseId] ?? null
}

export function getVideo(courseId: string, videoId: string): Video | null {
  const c = getCourse(courseId)
  if (!c) return null
  return c.videos.find((v) => v.id === videoId) ?? null
}
