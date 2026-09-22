// Content quality — one preference over every step that writes or judges
// learning content.
//
// Each feature has a BASE tier (what everyone gets: the right model for the
// job at the speed the moment allows) and, where it measurably helps, a DEEP
// tier (the learner's "Thorough" setting: a stronger model or more thinking,
// for a few seconds more). A feature whose base is already the best choice
// has the same tier twice. The reasoning and the measurements behind each
// row are in apps/polly/QUALITY.md; re-run scripts/polly/quality-bench.ts
// before changing one.

import { pollySupabase } from './supabase'

export type Quality = 'fast' | 'deep'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Tier = {
  /** A registry key (llm.ts) for llmComplete callers; a full model id for the judges. */
  model: string
  effort?: Effort
}
export type Feature =
  | 'cleanup'       // Infinity Chat: curate the fixes, vocab, grammar + drills
  | 'lessonPlan'    // guest lesson: pull the teacher's plan out of the transcript
  | 'lessonCards'   // a lesson's word / expression drills
  | 'grammarCards'  // a Polly lesson's grammar drills
  | 'topicCards'    // cards for any other topic, when the app names no model
  | 'answerJudge'   // grading typed and spoken card answers

const SONNET: Tier = { model: 'sonnet-5', effort: 'medium' }
const OPUS: Tier = { model: 'opus-5-5', effort: 'medium' }
const OPUS_HIGH: Tier = { model: 'opus-5-5', effort: 'high' }

export const TIERS: Record<Feature, Record<Quality, Tier>> = {
  // The learner is waiting on a spinner right after talking, and Sonnet's
  // ~9 s is the experience Bart likes; Opus at high catches more and never
  // "fixed" a correct sentence, for ~2–3 s more.
  cleanup: { fast: SONNET, deep: OPUS_HIGH },
  // Built once, in the background, and every card, chat and voice session on
  // the topic hangs off it. Sonnet attached example sentences that don't
  // contain the word; Opus didn't. Nobody should get the weaker plan.
  lessonPlan: { fast: OPUS_HIGH, deep: OPUS_HIGH },
  // Opus is as fast as Sonnet here (~10 s) and its distractors fit the blank
  // (same shape, same gender); decks are built in the background anyway.
  lessonCards: { fast: OPUS, deep: OPUS_HIGH },
  grammarCards: { fast: OPUS, deep: OPUS_HIGH },
  topicCards: { fast: OPUS, deep: OPUS_HIGH },
  // One call per finished set. With the language rubric Haiku is 18/20 in
  // 2 s; Opus at low effort is 20/20 in ~6 s.
  answerJudge: { fast: { model: 'claude-haiku-4-5' }, deep: { model: 'claude-opus-5-5', effort: 'low' } },
}

export function isQuality(v: unknown): v is Quality {
  return v === 'fast' || v === 'deep'
}

export function tierFor(feature: Feature, quality: Quality): Tier {
  return TIERS[feature][quality]
}

/// The learner's setting (polly_users.content_quality, schema 008). Account
/// level, so work that runs without a request — a deck built in after(), the
/// next lesson — gets it too. Anything unreadable is 'fast'.
export async function qualityFor(userId: string): Promise<Quality> {
  const { data, error } = await pollySupabase()
    .from('polly_users')
    .select('content_quality')
    .eq('id', userId)
    .maybeSingle()
  if (error) return 'fast'
  const q = (data as { content_quality?: unknown } | null)?.content_quality
  return isQuality(q) ? q : 'fast'
}
