// One unit apart — every word, number and timing in the animation lives here.
// index.html only draws what this file says. Durations are seconds; scenes
// play back to back, so changing one duration shifts everything after it.
// Facts come from Bart's Dodo topic "Unit Distance problem" (25 cards).
window.SCRIPT = {
  title: 'One unit apart',
  fps: 30,
  width: 1920,
  height: 1080,
  unit: 150, // one unit = 150 px on screen
  footer: 'Dodo · Unit Distance problem',
  colors: {
    paper: '#f7efdf',
    ink: '#16121c',
    red: '#ff4b1f', // constructions, lower bounds
    blue: '#3d3bff', // proofs, upper bounds
    yellow: '#ffc31f',
    lime: '#b6f23a',
  },
  scenes: [
    {
      id: 'ask',
      duration: 5,
      bg: 'paper',
      kicker: 'The unit distance problem',
      title: 'n points in the plane.<br>How many pairs can be<br>exactly one unit apart?',
      credit: 'Paul Erdős, 1946',
      // twelve points on a triangular lattice (exact unit spacing), as (i, j)
      points: [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [1, 3], [2, 3], [3, 3]],
      rotate: 17, // degrees, so the lattice doesn't read as a grid
    },
    {
      id: 'circles',
      duration: 7,
      bg: 'paper',
      caption: 'A circle of radius one around each point finds its partners.',
      pairsLabel: 'pairs exactly one unit apart',
      pairsAt: 4.3,
      rule: '<span class="red">Constructions give lower bounds.</span><br><span class="blue">Proofs give upper bounds.</span>',
      ruleAt: 4.0,
    },
    {
      id: 'grid',
      duration: 8,
      bg: 'paper',
      side: 6, // a 6 × 6 grid
      caption: 'Erdős’s rescaled grid —<br>the lower bound that stood about 80 years.',
      rulerLabel: '1',
      conjecture: { base: 'n', exp: '1 + o(1)' },
      conjectureNote: 'his conjecture: barely superlinear',
      conjectureAt: 5.5,
    },
    {
      id: 'ceiling',
      duration: 7,
      bg: 'paper',
      kicker: 'The ceiling',
      bound: { pre: 'O(', base: 'n', exp: '4/3', post: ')' },
      who: 'Spencer, Szemerédi and Trotter',
      year: '1984',
      claim: '1,000 points → about 10,000 pairs',
      claimAt: 3.0,
      strikeAt: 4.6,
      strike: 'only an upper bound — no known construction gets near it',
    },
    {
      id: 'exact',
      duration: 6,
      bg: 'paper',
      kicker: 'n =',
      from: 1,
      to: 15,
      countSeconds: 3.6,
      caption: 'Exact values are known only this far.',
      captionAt: 4.0,
    },
    {
      id: 'result',
      duration: 8,
      bg: 'blue',
      date: 'May 2026',
      line1: 'A general-purpose OpenAI reasoning model found a new construction —',
      line2: 'built from algebraic number fields — beating Erdős’s lower bound.',
      used: 'Lijie Chen used it.',
      verified: 'Mark Sellke and Mehtaab Sawhney verified it.',
      exponent: { base: 'n', exp: '1.014' },
      exponentNote: 'the exponent, proved by Will Sawin',
      exponentAt: 5.0,
    },
    {
      id: 'gap',
      duration: 4,
      bg: 'paper',
      axis: { from: 1.0, to: 1.4 },
      low: { value: 1.014, text: '1.014', label: 'best construction' },
      high: { value: 4 / 3, text: '4/3', label: 'best proof' },
      question: '?',
      caption: 'Erdős guessed the answer sits just above 1.',
      captionAt: 2.0,
    },
  ],
}
