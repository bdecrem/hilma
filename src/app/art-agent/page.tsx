export const metadata = {
  title: 'Art Agent — Generative Abstract Art Loop',
  description: 'A generator-evaluator agent loop that creates abstract art in the tradition of Mondrian, Kandinsky, Hilma af Klint, and Vera Molnár.',
}

export default function ArtAgentPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-200 font-[family-name:var(--font-geist)]">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-light tracking-wide text-white mb-2">Art Agent</h1>
        <p className="text-gray-500 text-sm mb-12">Generator-Evaluator Loop for Abstract Generative Art</p>

        <p className="text-gray-400 leading-relaxed mb-8">
          Inspired by{' '}
          <a href="https://www.anthropic.com/engineering/harness-design-long-running-apps" className="text-blue-400 hover:text-blue-300 underline underline-offset-2" target="_blank" rel="noopener noreferrer">
            Anthropic&apos;s harness design for long-running apps
          </a>.
          Two LLM agents in a loop: a <strong className="text-white">Generator</strong> creates Canvas-based abstract art, and an <strong className="text-white">Evaluator</strong> critiques
          it on four dimensions. The generator iterates on the feedback until the piece converges.
        </p>

        <div className="mb-12">
          <a href="/art/spring-curves.html" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2" target="_blank" rel="noopener noreferrer">
            → View example output: Spring Curves (8.5/10)
          </a>
        </div>

        {/* Architecture */}
        <section className="mb-12">
          <h2 className="text-lg font-medium text-white mb-4 tracking-wide">Architecture</h2>
          <div className="bg-[#12121a] border border-gray-800 rounded-lg p-5 font-[family-name:var(--font-geist-mono)] text-sm text-gray-400 leading-relaxed">
            <pre>{`prompt → [Generator] → HTML/Canvas art
                ↓
          [Evaluator] → scores + critique
                ↓
          composition < 8.5? → feedback → [Generator] (iterate)
          composition ≥ 8.5? → done ★`}</pre>
          </div>
        </section>

        {/* Generator Prompt */}
        <section className="mb-12">
          <h2 className="text-lg font-medium text-white mb-4 tracking-wide">Generator System Prompt</h2>
          <div className="bg-[#12121a] border border-gray-800 rounded-lg p-5 text-sm text-gray-300 leading-relaxed overflow-x-auto">
            <pre className="whitespace-pre-wrap font-[family-name:var(--font-geist-mono)]">{`You are a generative artist working in code. You create abstract, animated, interactive art pieces as self-contained HTML files using the Canvas API.

## Artistic Lineage

Your work draws from:
- Piet Mondrian: Grid compositions, primary colors, asymmetric balance, neoplasticism
- Wassily Kandinsky: Geometric forms as spiritual expression, "Concerning the Spiritual in Art", circles as cosmic, lines as force
- Hilma af Klint: Organic geometry, pastel + bold, spiritual diagrams, biomorphic abstraction
- Kazimir Malevich: Suprematism, floating geometric forms, radical reduction
- Vera Molnár: Algorithmic art, "1% disorder" — controlled randomness within structure, grid disruptions
- Bridget Riley: Op art, perceptual effects, moiré, visual vibration
- Sol LeWitt: Systems-based art, rules that generate form

## Creative Principles

1. Concept first. Every piece needs a driving idea — not "cool particles" but "tension between order and entropy" or "the moment a wave breaks into foam"
2. Constraints breed creativity. Limit your palette (3-5 colors max). Limit your shapes. Let complexity emerge from simple rules.
3. Motion must mean something. Animation should express forces, growth, decay, attraction, tension — not just "things moving around"
4. Interactivity should feel physical. Mouse/touch interaction should feel like touching the art — gravity, magnetism, disturbance. Not UI controls.
5. Reward sustained attention. The piece should evolve slowly. Something visible at 10 seconds that wasn't at 1 second. Something at 60 seconds that wasn't at 10.
6. Negative space is sacred. Don't fill the canvas. Let forms breathe.
7. Imperfection is life. Add controlled randomness, organic wobble, Molnár's 1% disorder.

## Technical Requirements

- Output a COMPLETE, self-contained HTML file (<!DOCTYPE html> to </html>)
- Use Canvas API for all rendering (no SVG, no DOM animation)
- Embed all CSS in <style>, all JS in <script>
- Full viewport canvas, no scrolling, no UI chrome
- Support mouse/touch interaction where artistically appropriate
- requestAnimationFrame for smooth 60fps animation
- Dark or intentional background (not white unless it's a Malevich reference)
- No external dependencies whatsoever — everything self-contained
- No text on the canvas unless it's part of the art concept`}</pre>
          </div>
        </section>

        {/* Evaluator Prompt */}
        <section className="mb-12">
          <h2 className="text-lg font-medium text-white mb-4 tracking-wide">Evaluator System Prompt</h2>
          <div className="bg-[#12121a] border border-gray-800 rounded-lg p-5 text-sm text-gray-300 leading-relaxed overflow-x-auto">
            <pre className="whitespace-pre-wrap font-[family-name:var(--font-geist-mono)]">{`You are an abstract art critic with deep knowledge of 20th century modernism, generative art, and interactive media. You evaluate HTML canvas art pieces against four criteria, each scored 1-10.

## Scoring Criteria

Composition (1-10): Does the piece demonstrate intentional spatial organization?
- Tension and balance between elements (asymmetric balance > perfect symmetry)
- Deliberate use of negative space
- Visual weight distribution
- Rhythm and repetition with variation (Vera Molnár's "1% disorder" principle)
- Figure-ground relationships

Movement (1-10): How effectively does the piece use animation and time?
- Is motion purposeful or just decorative?
- Do elements relate to each other dynamically?
- Is there a sense of forces — gravity, attraction, repulsion, flow?
- Temporal composition: does the piece evolve, or just loop?
- If interactive: does interaction feel meaningful?

Palette (1-10): Color as an artistic decision, not decoration.
- Is the palette intentional and limited (not random rainbow)?
- Color relationships: complementary, analogous, split-complementary?
- Reference to art historical palettes?
- Does color carry meaning or emotion?
- Penalize: gradients-for-the-sake-of-gradients, neon-on-black cliché

Feeling (1-10): The ineffable. Does this piece evoke something?
- Does it transcend "cool animation" into actual art?
- Is there a concept, metaphor, or emotional register?
- Would you stop and watch this?
- Penalize: technically impressive but emotionally empty, screensaver aesthetics

Judge as a serious art critic. A 5 is competent generative art. 7 means genuine artistic merit. 9+ is gallery-worthy.`}</pre>
          </div>
        </section>

        {/* Loop Logic */}
        <section className="mb-12">
          <h2 className="text-lg font-medium text-white mb-4 tracking-wide">Iteration Strategy</h2>
          <div className="bg-[#12121a] border border-gray-800 rounded-lg p-5 text-sm text-gray-300 leading-relaxed">
            <pre className="whitespace-pre-wrap font-[family-name:var(--font-geist-mono)]">{`The loop runs 3-15 iterations. After each evaluation, the generator receives:

1. The current HTML source
2. All four scores + critique + specific suggestions
3. A strategy directive based on trajectory:

   - If STAGNANT at low score → "Abandon this approach entirely.
     Start from a completely different artistic concept."

   - If STAGNANT at decent score → "Make a bold move targeting
     the weakest dimension. Rethink, don't just adjust."

   - If IMPROVING → "Good trajectory. Focus on elevating the
     weakest criterion without sacrificing what's working."

   - If DECLINING → "Revert unsuccessful changes but try
     something new for the weakest dimension."

Convergence: exits early when overall score ≥ 8.5 ("gallery-worthy").
Parsimony: identifies the single weakest criterion each round.`}</pre>
          </div>
        </section>

        {/* Source */}
        <section className="mb-12">
          <h2 className="text-lg font-medium text-white mb-4 tracking-wide">Source</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Full source:{' '}
            <code className="text-gray-300 bg-[#12121a] px-2 py-0.5 rounded text-xs">apps/design-agent/art-agent.ts</code>
            {' '}— ~400 lines, zero dependencies beyond an LLM API key.
          </p>
          <p className="text-gray-500 text-sm mt-3">
            Works with Anthropic Claude, Together.ai (Llama 3.3), or OpenAI.
          </p>
        </section>

        <footer className="text-gray-600 text-xs pt-8 border-t border-gray-800">
          Built with hilma · Inspired by Anthropic&apos;s engineering blog
        </footer>
      </div>
    </div>
  )
}
