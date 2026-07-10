// Chapter generation for Omniglot. Every chapter — prebaked, custom-topic,
// or distilled from a freeform conversation — comes out of the same
// generator, so quality and shape stay uniform. Sonnet 4.6: the wait is
// user-facing (custom topics ~15s), and it writes excellent dialogue.

import { llmComplete, type LlmTool } from '../f2/llm'
import { languageByCode, levelName, type OmniLanguage } from './languages'

const GENERATION_MODEL = 'sonnet-4-6'

export type DialogueLine = {
  speaker: string
  text: string
  romanization?: string
  translation: string
}

export type GrammarModule = {
  title: string
  explanation: string
  examples: { target: string; romanization?: string; translation: string }[]
}

export type CardDraft = {
  term: string
  romanization?: string
  meaning: string
  example: string
  example_translation: string
}

export type ChapterPackage = {
  title: string
  title_target: string
  emoji: string
  description: string
  dialogue: DialogueLine[]
  grammar: GrammarModule
  cards: CardDraft[]
}

export type Correction = {
  quote: string
  corrected: string
  note: string
}

export type Debrief = {
  summary: string
  corrections: Correction[]
}

function levelGuidance(level: number): string {
  const bands: Record<number, string> = {
    1: 'Absolute beginner (CEFR A1). Very short sentences, high-frequency words, present tense. Everything a first-week learner could repeat.',
    2: 'Elementary (CEFR A2). Simple everyday exchanges, basic past/future, common connectors.',
    3: 'Intermediate (CEFR B1). Natural everyday speech, opinions, narration across tenses.',
    4: 'Upper intermediate (CEFR B2). Fluid conversation, idiomatic turns, abstract topics.',
    5: 'Advanced (CEFR C1). Nuanced, native-paced language with colloquialisms and register shifts.',
    6: 'Mastery (CEFR C2). Sophisticated native-level language: humor, subtext, cultural reference.',
  }
  return bands[level] ?? bands[3]
}

function romanizationRule(lang: OmniLanguage): string {
  return lang.needsRomanization
    ? `Every target-language string must include its ${lang.romanizationName} in the matching romanization field.`
    : 'Leave all romanization fields out — this language uses the Latin script.'
}

const chapterTool = (lang: OmniLanguage): LlmTool => ({
  name: 'create_chapter',
  description: 'Return the complete chapter package.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short English title, e.g. "At the Market"' },
      title_target: { type: 'string', description: `The title in ${lang.name}` },
      emoji: { type: 'string', description: 'One emoji capturing the theme' },
      description: {
        type: 'string',
        description: 'One English sentence: what the learner will be able to do after this chapter',
      },
      dialogue: {
        type: 'array',
        description: '8-12 lines between two named speakers',
        items: {
          type: 'object',
          properties: {
            speaker: { type: 'string', description: 'Speaker first name' },
            text: { type: 'string', description: `The line in ${lang.name}` },
            romanization: { type: 'string' },
            translation: { type: 'string', description: 'English translation' },
          },
          required: ['speaker', 'text', 'translation'],
        },
      },
      grammar: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The grammar concept, in English' },
          explanation: {
            type: 'string',
            description: '3-6 plain-English sentences explaining the concept',
          },
          examples: {
            type: 'array',
            description: '2-4 example sentences using the concept',
            items: {
              type: 'object',
              properties: {
                target: { type: 'string' },
                romanization: { type: 'string' },
                translation: { type: 'string' },
              },
              required: ['target', 'translation'],
            },
          },
        },
        required: ['title', 'explanation', 'examples'],
      },
      cards: {
        type: 'array',
        description: '10-14 vocabulary flash cards drawn from the dialogue',
        items: {
          type: 'object',
          properties: {
            term: { type: 'string', description: `The word or phrase in ${lang.name}` },
            romanization: { type: 'string' },
            meaning: { type: 'string', description: 'Concise English meaning' },
            example: { type: 'string', description: `A short example sentence in ${lang.name}` },
            example_translation: { type: 'string' },
          },
          required: ['term', 'meaning', 'example', 'example_translation'],
        },
      },
    },
    required: ['title', 'title_target', 'emoji', 'description', 'dialogue', 'grammar', 'cards'],
  },
})

function chapterSystem(lang: OmniLanguage, level: number): string {
  return `You are the curriculum author for Omniglot, a ${lang.name} course built around live conversation. You write one "chapter" at a time, in the style of ChinesePod's themed weekly lessons: a natural, slightly playful dialogue two real people might actually have, a vocabulary set drawn from it, and one grammar concept it demonstrates.

Learner level: ${levelName(level)} — ${levelGuidance(level)}

Rules:
- The dialogue must feel alive — small stakes, a little humor or friction, real texture. Never a textbook script where people announce facts at each other.
- Vocabulary cards must come from (or directly support) the dialogue.
- Pick the ONE grammar concept the dialogue naturally showcases.
- ${romanizationRule(lang)}
- English fields are English; target-language fields are ${lang.name}. Never mix.`
}

async function runChapterTool(
  lang: OmniLanguage,
  level: number,
  userPrompt: string,
): Promise<ChapterPackage> {
  const result = await llmComplete({
    model: GENERATION_MODEL,
    system: chapterSystem(lang, level),
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 8000,
    tools: [chapterTool(lang)],
    forceTool: true,
  })
  if (result.type !== 'tool_call' || result.name !== 'create_chapter') {
    throw new Error('Chapter generation returned no tool call')
  }
  const pkg = result.input as unknown as ChapterPackage
  if (!pkg.title || !Array.isArray(pkg.dialogue) || pkg.dialogue.length === 0 ||
      !Array.isArray(pkg.cards) || pkg.cards.length === 0 || !pkg.grammar) {
    throw new Error('Chapter generation returned an incomplete package')
  }
  return pkg
}

export async function generateChapter(input: {
  language: string
  level: number
  theme: string
  /** Extra author guidance, e.g. "avoid overlapping these existing chapters: ..." */
  avoid?: string
}): Promise<ChapterPackage> {
  const lang = languageByCode(input.language)
  if (!lang) throw new Error(`Unknown language: ${input.language}`)
  const avoid = input.avoid ? `\n\n${input.avoid}` : ''
  return runChapterTool(
    lang,
    input.level,
    `Write the chapter for this theme: "${input.theme}".${avoid}`,
  )
}

export type TranscriptTurn = { role: string; text: string }

function formatTranscript(transcript: TranscriptTurn[]): string {
  return transcript
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && t.text?.trim())
    .map((t) => `${t.role === 'user' ? 'Learner' : 'Tutor'}: ${t.text.trim()}`)
    .join('\n')
    .slice(0, 24000)
}

/** Distill a freeform conversation into a full chapter the learner can study. */
export async function chapterFromTranscript(input: {
  language: string
  level: number
  transcript: TranscriptTurn[]
}): Promise<ChapterPackage> {
  const lang = languageByCode(input.language)
  if (!lang) throw new Error(`Unknown language: ${input.language}`)
  return runChapterTool(
    lang,
    input.level,
    `The learner just had this freeform conversation with their tutor. Distill it into a chapter: name the theme from what they actually talked about, write a fresh model dialogue on that theme (do NOT transcribe the conversation — write the idealized version of it), and build the vocabulary set from words the learner used, struggled with, or clearly needed.

Transcript:
${formatTranscript(input.transcript)}`,
  )
}

const debriefTool: LlmTool = {
  name: 'debrief',
  description: 'Return the post-conversation debrief.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Two or three warm English sentences: what the learner talked about and did well.',
      },
      corrections: {
        type: 'array',
        description: 'The most useful corrections, max 6. Empty array if the learner made no notable errors.',
        items: {
          type: 'object',
          properties: {
            quote: { type: 'string', description: "What the learner actually said (their words)" },
            corrected: { type: 'string', description: 'The corrected version, in the target language' },
            note: { type: 'string', description: 'One short English sentence on why' },
          },
          required: ['quote', 'corrected', 'note'],
        },
      },
    },
    required: ['summary', 'corrections'],
  },
}

/** Post-conversation notes: summary + gentle corrections pulled from the transcript. */
export async function debriefConversation(input: {
  language: string
  level: number
  transcript: TranscriptTurn[]
}): Promise<Debrief> {
  const lang = languageByCode(input.language)
  if (!lang) throw new Error(`Unknown language: ${input.language}`)
  const result = await llmComplete({
    model: GENERATION_MODEL,
    system: `You are a ${lang.name} tutor writing up session notes for a ${levelName(input.level)} learner. You are encouraging and precise — an editor's pencil, not a red pen. Only flag errors worth remembering; ignore hesitations, fillers, and transcription artifacts.`,
    messages: [
      {
        role: 'user',
        content: `Debrief this conversation.\n\nTranscript:\n${formatTranscript(input.transcript)}`,
      },
    ],
    maxTokens: 3000,
    tools: [debriefTool],
    forceTool: true,
  })
  if (result.type !== 'tool_call' || result.name !== 'debrief') {
    throw new Error('Debrief returned no tool call')
  }
  const d = result.input as unknown as Debrief
  return {
    summary: d.summary ?? '',
    corrections: Array.isArray(d.corrections) ? d.corrections : [],
  }
}
