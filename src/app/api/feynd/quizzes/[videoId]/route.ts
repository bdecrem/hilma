import { NextRequest, NextResponse } from 'next/server'
import { feyndAuth, feyndSupabase } from '@/lib/feynd/supabase'
import { opusAsk } from '@/lib/feynd/opus'
import { getVideo, getCourse } from '@/lib/feynd/course'

export const runtime = 'nodejs'
export const maxDuration = 90

type QuizQuestion = {
  id: string
  q: string
  options: [string, string, string, string]
  correct_idx: number
  explanation: string
  concept_ids?: string[]
}

// GET /api/feynd/quizzes/:videoId?course_id=<id>
// Lazily generates and caches a 6-question multiple-choice quiz for the
// video. Also mixes in the user's past Q&A (chat messages) for this video
// so quiz items can reflect what they actually asked about.
export async function GET(request: NextRequest, { params }: { params: Promise<{ videoId: string }> }) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { videoId } = await params
  const { searchParams } = new URL(request.url)
  const courseId = searchParams.get('course_id') ?? 'frontier-ai-2026'

  const sb = feyndSupabase()

  // Return cached quiz if present.
  const { data: cached } = await sb
    .from('feynd_quizzes')
    .select('*')
    .eq('course_id', courseId)
    .eq('video_id', videoId)
    .maybeSingle()
  if (cached) {
    return NextResponse.json({ quiz: cached, cached: true })
  }

  const course = getCourse(courseId)
  const video = getVideo(courseId, videoId)
  if (!course || !video) {
    return NextResponse.json({ error: 'Course/video not found' }, { status: 404 })
  }

  // Pull any Q&A the user has had about this video (across their chats) to
  // inform question selection. This is scoped to the device so the quiz
  // reflects what THEY asked about.
  const { data: chats } = await sb
    .from('feynd_chats')
    .select('id')
    .eq('device_id', auth.deviceId)
    .eq('course_id', courseId)
    .eq('video_id', videoId)
  const chatIds = (chats ?? []).map((c) => c.id)
  let priorQnA: { role: string; text: string }[] = []
  if (chatIds.length > 0) {
    const { data: msgs } = await sb
      .from('feynd_messages')
      .select('role, text')
      .in('chat_id', chatIds)
      .order('created_at', { ascending: true })
    priorQnA = msgs ?? []
  }

  // Collect the concepts this video covers (for tagging questions).
  const videoConcepts = video.concepts
    .map((cid) => course.concepts.find((c) => c.id === cid))
    .filter(Boolean)
    .map((c) => `${c!.id}: ${c!.label}`)
    .join('\n')

  const priorBlock = priorQnA.length > 0
    ? `\n\nThe learner has already asked the following questions about this video (paired with the answers they got). Treat these as high-priority material — the quiz should reinforce and verify these areas:\n\n${
        priorQnA.map((m) => `${m.role.toUpperCase()}: ${m.text}`).join('\n\n').slice(0, 18000)
      }`
    : ''

  const prompt = `Generate a 6-question multiple-choice quiz for a learner who just watched this video.

VIDEO: "${video.title}" — ${video.author}${video.host ? ` (with ${video.host})` : ''}, ${video.publishedOn}

CONCEPTS THIS VIDEO COVERS (use these ids when tagging questions):
${videoConcepts}${priorBlock}

Rules for the quiz:
- 6 questions, each with exactly 4 options.
- Test comprehension and recall, not trivia. Mix specifics from the video with general concept understanding.
- Make wrong answers plausible — the quiz should be honestly challenging.
- Include a one-sentence explanation for each correct answer.
- Tag each question with 1–3 concept_ids from the list above (use the ids, not the labels).

Return STRICT JSON matching this schema, no prose, no markdown fences:

{
  "questions": [
    {
      "id": "q1",
      "q": "...",
      "options": ["A", "B", "C", "D"],
      "correct_idx": 0,
      "explanation": "...",
      "concept_ids": ["scaling_laws"]
    }
  ]
}`

  let raw: string
  try {
    raw = await opusAsk({
      question: prompt,
      videoContext: {
        title: video.title,
        author: video.author,
        host: video.host,
        publishedOn: video.publishedOn,
        transcript: video.transcript?.text ?? '',
      },
      system: `You are a precise quiz writer. Output ONLY valid JSON conforming to the requested schema. No prose, no markdown fences, no commentary.`,
      maxTokens: 2500,
      temperature: 0.7,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Opus failed: ${msg}` }, { status: 502 })
  }

  // Opus sometimes wraps JSON in ```json ... ``` despite instructions.
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  let parsed: { questions?: QuizQuestion[] }
  try {
    parsed = JSON.parse(cleaned)
  } catch (e) {
    return NextResponse.json({ error: 'Opus returned non-JSON', raw: cleaned.slice(0, 400) }, { status: 502 })
  }
  const questions = Array.isArray(parsed.questions) ? parsed.questions : []
  if (questions.length < 3) {
    return NextResponse.json({ error: 'Opus returned too few questions', raw: cleaned.slice(0, 400) }, { status: 502 })
  }

  const { data: inserted, error: insErr } = await sb
    .from('feynd_quizzes')
    .insert({ course_id: courseId, video_id: videoId, questions })
    .select()
    .single()
  if (insErr) {
    // Race: someone else may have inserted between our read and write.
    const { data: fallback } = await sb
      .from('feynd_quizzes')
      .select('*')
      .eq('course_id', courseId)
      .eq('video_id', videoId)
      .maybeSingle()
    if (fallback) return NextResponse.json({ quiz: fallback, cached: true })
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ quiz: inserted, cached: false })
}
