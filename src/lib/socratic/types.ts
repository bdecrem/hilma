// Socratic — shared types for the study sessions.
//
// A session is one student working through one module under one study arm.
// Every tutor reply carries a small self-report (phase, move, how it read
// the student's last message, the mastery flags); every student message
// gets an independent verdict from the observer. Both are logged so the
// researchers can measure what happened, turn by turn, across arms.

export type Arm = 'A' | 'B' | 'C'

/** Where the session protocol is (tutor-reported after each reply). */
export type Phase = 'overview' | 'readiness' | 'questioning' | 'mastery' | 'done'
export const PHASES: Phase[] = ['overview', 'readiness', 'questioning', 'mastery', 'done']

/** The method move a tutor reply primarily makes (Zeiler's (a)–(i) plus the protocol steps). */
export type Move =
  | 'overview' // Step 1
  | 'readiness_check' // Step 2
  | 'probe' // a question from the bank, no correction needed
  | 'commit' // (a) take a position, don't hedge
  | 'facts_not_argument' // (b) "a list of facts is never an argument"
  | 'scaffold' // (c) one of the three strategies, offered once stuck
  | 'flip' // (d) argue the other side
  | 'line_drawing' // (e) where does the rule stop?
  | 'sympathetic_group' // (f) who is hurt if we stretch too far?
  | 'name_skill' // (g) name the meta-skill after the fact
  | 'boundary' // (h) that's causation, not duty
  | 'recap' // (i) situate in the outline
  | 'teach' // doctrinal correction, then re-probe from a new angle
  | 'mastery_summary' // Step 4
  | 'answer' // plain explanation / direct answer (arm A's default)
export const MOVES: Move[] = [
  'overview', 'readiness_check', 'probe', 'commit', 'facts_not_argument', 'scaffold', 'flip',
  'line_drawing', 'sympathetic_group', 'name_skill', 'boundary', 'recap', 'teach', 'mastery_summary', 'answer',
]

/** How a student message reads against the method. */
export type AnswerType =
  | 'none' // no student message yet (the opening turn)
  | 'ready' // "yes, go ahead"
  | 'not_ready' // wants more explanation first
  | 'question' // asks the tutor something
  | 'bare_conclusion' // "yes, liable" with nothing behind it
  | 'hedge' // "it depends" without committing
  | 'list_of_facts' // true facts, no reasoning connecting them to the conclusion
  | 'argument' // facts connected to a conclusion by reasoning
  | 'counter_argument' // argues the other side
  | 'line_drawing' // proposes or defends a limiting principle
  | 'sympathetic_group' // names a group harmed by over-extension
  | 'element_conflation' // argues causation/breach when the question is duty
  | 'doctrinal_error' // misstates the rule or the holding
  | 'stuck' // "I don't know" / can't take the next step
  | 'other'
export const ANSWER_TYPES: AnswerType[] = [
  'none', 'ready', 'not_ready', 'question', 'bare_conclusion', 'hedge', 'list_of_facts', 'argument',
  'counter_argument', 'line_drawing', 'sympathetic_group', 'element_conflation', 'doctrinal_error', 'stuck', 'other',
]

export type MasteryKey = 'holding' | 'structure' | 'both_sides' | 'line_drawing'
export const MASTERY_KEYS: MasteryKey[] = ['holding', 'structure', 'both_sides', 'line_drawing']
export type Mastery = Record<MasteryKey, boolean>
export const EMPTY_MASTERY: Mastery = { holding: false, structure: false, both_sides: false, line_drawing: false }

/** The tutor's structured output, minus the reply text. */
export type TutorMeta = {
  phase: Phase
  move: Move
  student_answer: AnswerType
  mastery: Mastery
}

/** The observer's independent read of one student message. */
export type Verdict = {
  answer_type: AnswerType
  /** 0 = no reasoning / off-topic · 1 = facts or a conclusion, unconnected · 2 = a real argument with a gap · 3 = complete and well connected (or a correct doctrinal statement) */
  quality: 0 | 1 | 2 | 3
  doctrinal_error: boolean
  recommended_move: Move
  rationale: string
}

export type Turn = {
  id: string
  session_id: string
  idx: number
  role: 'student' | 'tutor'
  content: string
  hidden: boolean
  meta: TutorMeta | Verdict | null
  coach: string | null
  usage: Record<string, unknown> | null
  latency_ms: number | null
  model: string | null
  created_at: string
}

export type Session = {
  id: string
  participant: string
  arm: Arm
  module: string
  phase: Phase
  mastery: Mastery
  turns: number
  tutor_model: string | null
  created_at: string
  updated_at: string
  ended_at: string | null
}

export type Module = {
  id: string
  title: string
  subtitle: string
  course: string
  source: string
  doctrine: string
  hypothetical: string
  method: string
  protocol: string
  questionBank: string
  tone: string
  masteryCriteria: Record<MasteryKey, string>
  transcript: string
}
