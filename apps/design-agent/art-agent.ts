#!/usr/bin/env npx tsx
/**
 * ART AGENT — Generator-Evaluator loop for abstract generative art
 *
 * Creates interactive, animated abstract art pieces in the tradition of
 * Mondrian, Kandinsky, Malevich, Hilma af Klint, Vera Molnár — but with
 * motion, physics, and interactivity. Canvas-based, self-contained HTML.
 *
 * Usage:
 *   npx tsx apps/design-agent/art-agent.ts "geometric meditation on balance"
 *   npx tsx apps/design-agent/art-agent.ts "Kandinsky-inspired sound visualization" --iterations 6
 *   npx tsx apps/design-agent/art-agent.ts "Mondrian meets particle physics" --open
 *
 * Env:
 *   ANTHROPIC_API_KEY  — uses Claude (preferred)
 *   TOGETHER_API_KEY   — fallback to Together.ai
 *   OPENAI_API_KEY     — fallback to OpenAI
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── ANSI ────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
}

// ── LLM Client ──────────────────────────────────────────────────

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface LLMConfig {
  provider: 'anthropic' | 'together' | 'openai'
  apiKey: string
  model: string
  baseUrl: string
}

function detectLLM(): LLMConfig {
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-sonnet-4-20250514',
      baseUrl: 'https://api.anthropic.com',
    }
  }
  if (process.env.TOGETHER_API_KEY) {
    return {
      provider: 'together',
      apiKey: process.env.TOGETHER_API_KEY,
      model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
      baseUrl: 'https://api.together.xyz',
    }
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: 'gpt-4o',
      baseUrl: 'https://api.openai.com',
    }
  }
  console.error('No API key found. Set ANTHROPIC_API_KEY, TOGETHER_API_KEY, or OPENAI_API_KEY.')
  process.exit(1)
}

async function callLLM(config: LLMConfig, messages: Message[], maxTokens = 8192): Promise<string> {
  if (config.provider === 'anthropic') {
    const systemMsg = messages.find(m => m.role === 'system')?.content || ''
    const chatMessages = messages.filter(m => m.role !== 'system')

    const res = await fetch(`${config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: maxTokens,
        system: systemMsg,
        messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
      }),
    })
    const data = await res.json() as { content?: { text: string }[]; error?: { message: string } }
    if (data.error) throw new Error(data.error.message)
    return data.content?.[0]?.text || ''
  }

  const res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.8, // slightly higher for art
    }),
  })
  const data = await res.json() as { choices?: { message: { content: string } }[]; error?: { message: string } }
  if (data.error) throw new Error(data.error.message)
  return data.choices?.[0]?.message?.content || ''
}

// ── Art-specific Criteria ───────────────────────────────────────

interface Scores {
  composition: number
  movement: number
  palette: number
  feeling: number
  overall: number
  critique: string
  suggestions: string[]
}

const EVALUATOR_SYSTEM = `You are an abstract art critic with deep knowledge of 20th century modernism, generative art, and interactive media. You evaluate HTML canvas art pieces against four criteria, each scored 1-10.

## Scoring Criteria

**Composition** (1-10): Does the piece demonstrate intentional spatial organization? Look for:
- Tension and balance between elements (asymmetric balance > perfect symmetry)
- Deliberate use of negative space
- Visual weight distribution
- Rhythm and repetition with variation (Vera Molnár's "1% disorder" principle)
- Figure-ground relationships
- Does it feel composed or merely scattered?

**Movement** (1-10): How effectively does the piece use animation and time?
- Is motion purposeful or just decorative?
- Do elements relate to each other dynamically (not just independent particles)?
- Is there a sense of forces — gravity, attraction, repulsion, flow?
- Temporal composition: does the piece evolve, or just loop?
- Frame rate and smoothness of animation
- If interactive: does interaction feel meaningful, not just "drag to move"?

**Palette** (1-10): Color as an artistic decision, not decoration.
- Is the palette intentional and limited (not random rainbow)?
- Color relationships: complementary, analogous, split-complementary?
- Reference to art historical palettes (Mondrian's primaries, Kandinsky's warm/cool contrasts, Hilma af Klint's pastels-and-black, Malevich's stark contrasts)?
- Does color carry meaning or emotion?
- Penalize: gradients-for-the-sake-of-gradients, neon-on-black cliché, random hues

**Feeling** (1-10): The ineffable. Does this piece evoke something?
- Does it transcend "cool animation" into actual art?
- Is there a concept, metaphor, or emotional register?
- Would you stop and watch this? Would you show someone?
- Does it reward sustained attention?
- Penalize: technically impressive but emotionally empty, screensaver aesthetics

## Output Format

You MUST respond in this exact JSON format, no other text:
{
  "composition": <number 1-10>,
  "movement": <number 1-10>,
  "palette": <number 1-10>,
  "feeling": <number 1-10>,
  "critique": "<2-3 sentence assessment as an art critic would write>",
  "suggestions": ["<specific artistic direction 1>", "<specific artistic direction 2>", "<specific artistic direction 3>"]
}

Judge as a serious art critic. A 5 is competent generative art. 7 means it has genuine artistic merit. 9+ is gallery-worthy. Most code-generated art deserves 3-5 on feeling — be honest about that.`

const GENERATOR_SYSTEM = `You are a generative artist working in code. You create abstract, animated, interactive art pieces as self-contained HTML files using the Canvas API.

## Artistic Lineage

Your work draws from:
- **Piet Mondrian**: Grid compositions, primary colors, asymmetric balance, neoplasticism
- **Wassily Kandinsky**: Geometric forms as spiritual expression, "Concerning the Spiritual in Art", circles as cosmic, lines as force
- **Hilma af Klint**: Organic geometry, pastel + bold, spiritual diagrams, biomorphic abstraction
- **Kazimir Malevich**: Suprematism, floating geometric forms, radical reduction
- **Vera Molnár**: Algorithmic art, "1% disorder" — controlled randomness within structure, grid disruptions
- **Bridget Riley**: Op art, perceptual effects, moiré, visual vibration
- **Sol LeWitt**: Systems-based art, rules that generate form
- **Amber** (our AI agent): Warm amber tones (#D4A574), teal accents (#2D9596), particle physics, character through abstraction, playful transformation

## Creative Principles

1. **Concept first.** Every piece needs a driving idea — not "cool particles" but "tension between order and entropy" or "the moment a wave breaks into foam"
2. **Constraints breed creativity.** Limit your palette (3-5 colors max). Limit your shapes. Let complexity emerge from simple rules.
3. **Motion must mean something.** Animation should express forces, growth, decay, attraction, tension — not just "things moving around"
4. **Interactivity should feel physical.** Mouse/touch interaction should feel like touching the art — gravity, magnetism, disturbance. Not UI controls.
5. **Reward sustained attention.** The piece should evolve slowly. Something visible at 10 seconds that wasn't at 1 second. Something at 60 seconds that wasn't at 10.
6. **Negative space is sacred.** Don't fill the canvas. Let forms breathe.
7. **Imperfection is life.** Add controlled randomness, organic wobble, Molnár's 1% disorder.

## Technical Requirements

- Output a COMPLETE, self-contained HTML file (<!DOCTYPE html> to </html>)
- Use Canvas API for all rendering (no SVG, no DOM animation)
- Embed all CSS in <style>, all JS in <script>
- Full viewport canvas, no scrolling, no UI chrome
- Support mouse/touch interaction where artistically appropriate
- requestAnimationFrame for smooth 60fps animation
- Dark or intentional background (not white unless it's a Malevich reference)
- No external dependencies whatsoever — everything self-contained
- No text on the canvas unless it's part of the art concept

## Output Format

Respond with ONLY the HTML file. No explanation, no markdown code fences. Start with <!DOCTYPE html>.`

// ── Helpers ─────────────────────────────────────────────────────

function extractHTML(response: string): string {
  const htmlMatch = response.match(/<!DOCTYPE html>[\s\S]*<\/html>/i)
  if (htmlMatch) return htmlMatch[0]
  const fenceMatch = response.match(/```(?:html)?\s*(<!DOCTYPE html>[\s\S]*<\/html>)\s*```/i)
  if (fenceMatch) return fenceMatch[1]
  if (response.trim().startsWith('<')) return response.trim()
  return response
}

function extractScores(response: string): Scores {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    const parsed = JSON.parse(jsonMatch[0])
    return {
      composition: Math.min(10, Math.max(1, parsed.composition || 1)),
      movement: Math.min(10, Math.max(1, parsed.movement || 1)),
      palette: Math.min(10, Math.max(1, parsed.palette || 1)),
      feeling: Math.min(10, Math.max(1, parsed.feeling || 1)),
      overall: 0,
      critique: parsed.critique || '',
      suggestions: parsed.suggestions || [],
    }
  } catch {
    return {
      composition: 3, movement: 3, palette: 3, feeling: 3,
      overall: 3, critique: 'Failed to parse evaluation', suggestions: [],
    }
  }
}

function scoreBar(score: number, label: string, width = 20): string {
  const filled = Math.round((score / 10) * width)
  const empty = width - filled
  const color = score >= 7 ? c.green : score >= 5 ? c.yellow : c.red
  return `  ${label.padEnd(16)} ${color}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset} ${color}${score.toFixed(1)}${c.reset}`
}

function displayScores(scores: Scores, iteration: number) {
  console.log()
  console.log(`  ${c.bold}Iteration ${iteration} — Critique${c.reset}`)
  console.log()
  console.log(scoreBar(scores.composition, 'Composition'))
  console.log(scoreBar(scores.movement, 'Movement'))
  console.log(scoreBar(scores.palette, 'Palette'))
  console.log(scoreBar(scores.feeling, 'Feeling'))
  console.log(`  ${c.dim}${'─'.repeat(50)}${c.reset}`)
  console.log(scoreBar(scores.overall, 'OVERALL'))
  console.log()
  console.log(`  ${c.dim}${scores.critique}${c.reset}`)
  console.log()
}

// ── Prompt Library ──────────────────────────────────────────────

const PROMPTS: Record<string, string> = {
  'mondrian':    'A Mondrian-inspired composition where the grid lines slowly drift and reform, primary-colored rectangles pulse with breath-like rhythm. Click to shatter a cell into smaller grids.',
  'kandinsky':   'Circles, triangles, and lines floating in Kandinsky\'s spiritual space. Forms attract and repel each other with invisible forces. Mouse proximity creates gravitational wells.',
  'suprematist': 'Malevich suprematism: stark geometric forms floating on white void. Squares, crosses, circles in red/black drift with glacial slowness, occasionally aligning into momentary compositions.',
  'molnar':      'A Vera Molnár grid study: perfect squares with 1% disorder. Over time, the disorder slowly increases — order dissolving into chaos, then snapping back. The moment of maximum entropy is beautiful.',
  'hilma':       'Hilma af Klint\'s spiritual diagrams reimagined: concentric organic forms in pastels and gold, slowly rotating and breathing. Biomorphic shapes that feel like cells dividing under a microscope.',
  'riley':       'Bridget Riley op-art: parallel lines that warp and undulate, creating moiré interference patterns. Mouse movement bends the field. The illusion of depth from pure 2D pattern.',
  'amber':       'Warm amber forms (#D4A574) drifting through deep space, leaving glowing trails. Teal (#2D9596) accents spark where forms nearly touch. Physics-based attraction. A meditation on digital warmth.',
}

// ── Main Loop ───────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
${c.bold}ART AGENT${c.reset} — Generator-Evaluator Loop for Abstract Generative Art

${c.dim}Usage:${c.reset}
  npx tsx apps/design-agent/art-agent.ts "geometric meditation on balance"
  npx tsx apps/design-agent/art-agent.ts --preset kandinsky --iterations 6
  npx tsx apps/design-agent/art-agent.ts "Mondrian meets particle physics" --open

${c.dim}Presets:${c.reset}`)
    for (const [name, desc] of Object.entries(PROMPTS)) {
      console.log(`  ${c.cyan}${name.padEnd(14)}${c.reset} ${c.dim}${desc.slice(0, 70)}...${c.reset}`)
    }
    console.log(`
${c.dim}Options:${c.reset}
  --preset <name>    Use a built-in art prompt
  --iterations <n>   Max iterations (default: 5)
  --open             Open final result in browser
  --out <dir>        Output directory (default: apps/design-agent/art-output)
`)
    process.exit(0)
  }

  let prompt = ''
  let maxIterations = 5
  let openBrowser = false
  let outDir = path.join(__dirname, 'art-output')

  const nonFlagArgs: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--iterations' && args[i + 1]) { maxIterations = parseInt(args[++i]); continue }
    if (args[i] === '--open') { openBrowser = true; continue }
    if (args[i] === '--out' && args[i + 1]) { outDir = args[++i]; continue }
    if (args[i] === '--preset' && args[i + 1]) {
      const preset = args[++i]
      if (!PROMPTS[preset]) {
        console.error(`Unknown preset: ${preset}. Available: ${Object.keys(PROMPTS).join(', ')}`)
        process.exit(1)
      }
      prompt = PROMPTS[preset]
      continue
    }
    nonFlagArgs.push(args[i])
  }
  if (!prompt) prompt = nonFlagArgs.join(' ')

  if (!prompt) {
    console.error('Error: provide an art prompt or use --preset')
    process.exit(1)
  }

  fs.mkdirSync(outDir, { recursive: true })

  const llm = detectLLM()

  console.log()
  console.log(`${c.bold}${c.magenta}╔══════════════════════════════════════════════════════════╗${c.reset}`)
  console.log(`${c.bold}${c.magenta}║${c.reset}  ${c.bold}ART AGENT${c.reset} — Generative Abstract Art Loop              ${c.bold}${c.magenta}║${c.reset}`)
  console.log(`${c.bold}${c.magenta}╚══════════════════════════════════════════════════════════╝${c.reset}`)
  console.log()
  console.log(`  ${c.dim}Concept:${c.reset}    ${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}`)
  console.log(`  ${c.dim}Provider:${c.reset}   ${llm.provider} (${llm.model})`)
  console.log(`  ${c.dim}Iterations:${c.reset} ${maxIterations}`)
  console.log(`  ${c.dim}Output:${c.reset}     ${outDir}`)
  console.log()

  let currentHTML = ''
  let bestHTML = ''
  let bestScore = 0
  let bestIteration = 0
  const history: Scores[] = []

  for (let i = 1; i <= maxIterations; i++) {
    console.log(`${c.bold}${c.magenta}── Iteration ${i}/${maxIterations} ${'─'.repeat(42)}${c.reset}`)

    // ── GENERATE ──
    console.log(`  ${c.cyan}⟳ Creating...${c.reset}`)

    let generatorMessages: Message[]

    if (i === 1) {
      generatorMessages = [
        { role: 'system', content: GENERATOR_SYSTEM },
        {
          role: 'user',
          content: `Create an abstract generative art piece:

${prompt}

Remember: concept first, then code. What is this piece ABOUT? What forces drive it? What should the viewer feel? Then build it. Use Canvas API, make it animated and interactive.`,
        },
      ]
    } else {
      const lastScores = history[history.length - 1]
      const trending = history.length >= 2
      const improving = trending && history[history.length - 1].overall > history[history.length - 2].overall
      const stagnant = trending && Math.abs(history[history.length - 1].overall - history[history.length - 2].overall) < 0.3

      // Find weakest criterion
      const criteria = [
        { name: 'composition', score: lastScores.composition },
        { name: 'movement', score: lastScores.movement },
        { name: 'palette', score: lastScores.palette },
        { name: 'feeling', score: lastScores.feeling },
      ].sort((a, b) => a.score - b.score)
      const weakest = criteria[0]

      let strategy: string
      if (stagnant && lastScores.overall < 5.5) {
        strategy = `The piece has STALLED at a low score. Abandon this approach entirely. Start from a completely different artistic concept — different shapes, different forces, different mood. Keep only the original prompt as a constraint.`
      } else if (stagnant) {
        strategy = `Progress has stalled. The weakest dimension is "${weakest.name}" (${weakest.score}/10). Make a bold move specifically targeting that dimension. Don't just adjust parameters — rethink the artistic approach to ${weakest.name}.`
      } else if (improving) {
        strategy = `Good trajectory — the art is getting stronger. Focus on elevating "${weakest.name}" (${weakest.score}/10) without sacrificing what's working. Refine, don't rebuild.`
      } else {
        strategy = `Scores dropped. The last changes hurt more than helped. Revert the unsuccessful direction but try something new for "${weakest.name}" (${weakest.score}/10).`
      }

      generatorMessages = [
        { role: 'system', content: GENERATOR_SYSTEM },
        {
          role: 'user',
          content: `Original art concept: ${prompt}

Current implementation:

${currentHTML}

## Art Critic Feedback (iteration ${i - 1})

Composition: ${lastScores.composition}/10
Movement: ${lastScores.movement}/10
Palette: ${lastScores.palette}/10
Feeling: ${lastScores.feeling}/10
Overall: ${lastScores.overall.toFixed(1)}/10

"${lastScores.critique}"

Artistic directions to explore:
${lastScores.suggestions.map((s, j) => `${j + 1}. ${s}`).join('\n')}

## Strategy

${strategy}

Create an improved version. Output ONLY the complete HTML file.`,
        },
      ]
    }

    const genStart = Date.now()
    const genResponse = await callLLM(llm, generatorMessages, 12000)
    currentHTML = extractHTML(genResponse)
    const genTime = ((Date.now() - genStart) / 1000).toFixed(1)

    const iterFile = path.join(outDir, `iteration-${i}.html`)
    fs.writeFileSync(iterFile, currentHTML)
    console.log(`  ${c.green}✓ Created${c.reset} ${c.dim}(${genTime}s, ${(currentHTML.length / 1024).toFixed(1)}KB) → ${iterFile}${c.reset}`)

    // ── EVALUATE ──
    console.log(`  ${c.magenta}⟳ Critiquing...${c.reset}`)

    const evalMessages: Message[] = [
      { role: 'system', content: EVALUATOR_SYSTEM },
      {
        role: 'user',
        content: `Evaluate this abstract generative art piece. The artist's concept was: "${prompt}"

Here is the complete HTML source (Canvas API art):

${currentHTML}

Score each criterion 1-10 as a serious art critic. Respond with JSON only.`,
      },
    ]

    const evalStart = Date.now()
    const evalResponse = await callLLM(llm, evalMessages, 2048)
    const evalTime = ((Date.now() - evalStart) / 1000).toFixed(1)

    const scores = extractScores(evalResponse)
    scores.overall = (scores.composition + scores.movement + scores.palette + scores.feeling) / 4

    history.push(scores)
    console.log(`  ${c.green}✓ Critiqued${c.reset} ${c.dim}(${evalTime}s)${c.reset}`)

    displayScores(scores, i)

    if (scores.overall > bestScore) {
      bestScore = scores.overall
      bestHTML = currentHTML
      bestIteration = i
    }

    if (scores.suggestions.length > 0) {
      console.log(`  ${c.yellow}Artistic directions:${c.reset}`)
      for (const s of scores.suggestions) {
        console.log(`    ${c.dim}→${c.reset} ${s}`)
      }
      console.log()
    }

    if (scores.overall >= 8.5) {
      console.log(`  ${c.bold}${c.green}✓ Gallery-worthy! Score ${scores.overall.toFixed(1)}.${c.reset}`)
      break
    }
  }

  // ── Summary ──
  console.log()
  console.log(`${c.bold}${c.magenta}══════════════════════════════════════════════════════════════${c.reset}`)
  console.log()
  console.log(`  ${c.bold}Art Agent Complete${c.reset}`)
  console.log()

  console.log(`  ${c.bold}Score Progression:${c.reset}`)
  const maxBarWidth = 30
  for (let i = 0; i < history.length; i++) {
    const s = history[i]
    const bar = '█'.repeat(Math.round((s.overall / 10) * maxBarWidth))
    const color = s.overall >= 7 ? c.green : s.overall >= 5 ? c.yellow : c.red
    const marker = i + 1 === bestIteration ? ` ${c.green}★ best${c.reset}` : ''
    console.log(`    ${c.dim}iter ${String(i + 1).padStart(2)}${c.reset}  ${color}${bar}${c.reset} ${color}${s.overall.toFixed(1)}${c.reset}${marker}`)
  }
  console.log()

  const bestFile = path.join(outDir, 'best.html')
  fs.writeFileSync(bestFile, bestHTML)
  console.log(`  ${c.bold}Best piece:${c.reset} ${bestFile} ${c.dim}(iteration ${bestIteration}, score ${bestScore.toFixed(1)})${c.reset}`)
  console.log()

  const report = {
    prompt,
    provider: llm.provider,
    model: llm.model,
    iterations: history.length,
    bestIteration,
    bestScore,
    history: history.map((s, i) => ({
      iteration: i + 1,
      scores: {
        composition: s.composition,
        movement: s.movement,
        palette: s.palette,
        feeling: s.feeling,
        overall: s.overall,
      },
      critique: s.critique,
      suggestions: s.suggestions,
    })),
    timestamp: new Date().toISOString(),
  }
  const reportFile = path.join(outDir, 'report.json')
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2))
  console.log(`  ${c.dim}Report: ${reportFile}${c.reset}`)

  if (openBrowser) {
    const { exec } = await import('child_process')
    exec(`open "${bestFile}"`)
    console.log(`  ${c.dim}Opened in browser${c.reset}`)
  }

  console.log()
}

main().catch(err => {
  console.error(`${c.red}Error: ${err.message}${c.reset}`)
  process.exit(1)
})
