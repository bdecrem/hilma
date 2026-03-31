// Citrus spring background picker — every piece gets a unique bg
// Import this and call pickBackground() — it returns a CSS background value

const SOLIDS = [
  // Light grounds (keep a few, but not dominant)
  '#FFF8E7', // warm cream
  '#FFECD2', // soft peach
  '#FFF0F0', // light blush
  // Bold primaries — these should show up often
  '#F9D423', // mango
  '#FF6B81', // grapefruit pink
  '#B4E33D', // lime zest
  '#FF4E50', // blood orange
  '#FC913A', // tangerine
  // Deeper / moodier grounds
  '#1A1A2E', // midnight ink
  '#2D5A27', // deep leaf green
  '#4A1942', // plum shadow
  '#0D3B66', // deep ocean
  '#F5E6CC', // parchment
  '#E8D5B7', // sandstone
  '#C1E1C1', // sage
  '#FFB347', // warm amber
  '#E0BBE4', // soft lavender
  '#FFDAB9', // peach puff
]

const GRADIENTS = [
  // Warm light
  'linear-gradient(135deg, #FFECD2, #FFFDE7)',
  'linear-gradient(135deg, #FFF0F0, #FFFDE7)',
  // Bold citrus
  'linear-gradient(135deg, #F9D423, #FC913A)',
  'linear-gradient(135deg, #FF6B81, #FC913A)',
  'linear-gradient(135deg, #FF4E50, #F9D423)',
  'linear-gradient(180deg, #B4E33D, #F9D423)',
  // Deeper / richer
  'linear-gradient(135deg, #1A1A2E, #4A1942)',
  'linear-gradient(180deg, #0D3B66, #1A1A2E)',
  'linear-gradient(135deg, #2D5A27, #1A1A2E)',
  'linear-gradient(135deg, #FF4E50, #4A1942)',
  'linear-gradient(180deg, #FC913A, #FF4E50)',
  // Unexpected combos
  'linear-gradient(135deg, #E0BBE4, #FFECD2)',
  'linear-gradient(135deg, #C1E1C1, #F9D423)',
  'linear-gradient(180deg, #0D3B66, #B4E33D)',
  'linear-gradient(135deg, #FFB347, #FF6B81)',
]

// Pick a background based on a seed (use the page name or level number)
// Same seed always gives same result — deterministic but varied
export function pickBackground(seed: string | number): string {
  const s = typeof seed === 'number' ? seed : hashString(seed)
  const all = [...SOLIDS, ...GRADIENTS]
  return all[Math.abs(s) % all.length]
}

// Pick a solid color for canvas fillStyle (gradients need special handling)
export function pickSolidBg(seed: string | number): string {
  const s = typeof seed === 'number' ? seed : hashString(seed)
  return SOLIDS[Math.abs(s) % SOLIDS.length]
}

// Pick a random one — truly random, different every load
export function randomBackground(): string {
  const all = [...SOLIDS, ...GRADIENTS]
  return all[Math.floor(Math.random() * all.length)]
}

export function randomSolidBg(): string {
  return SOLIDS[Math.floor(Math.random() * SOLIDS.length)]
}

// For canvas: pick two colors for a gradient
export function pickGradientColors(seed: string | number): [string, string] {
  const pairs: [string, string][] = [
    // Light
    ['#FFECD2', '#FFFDE7'],
    ['#FFF0F0', '#FFFDE7'],
    // Bold citrus
    ['#F9D423', '#FC913A'],
    ['#FF6B81', '#FC913A'],
    ['#FF4E50', '#F9D423'],
    ['#B4E33D', '#F9D423'],
    ['#FC913A', '#FF4E50'],
    // Dark / moody
    ['#1A1A2E', '#4A1942'],
    ['#0D3B66', '#1A1A2E'],
    ['#2D5A27', '#1A1A2E'],
    ['#FF4E50', '#4A1942'],
    // Unexpected
    ['#E0BBE4', '#FFECD2'],
    ['#C1E1C1', '#F9D423'],
    ['#0D3B66', '#B4E33D'],
    ['#FFB347', '#FF6B81'],
  ]
  const s = typeof seed === 'number' ? seed : hashString(seed)
  return pairs[Math.abs(s) % pairs.length]
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}
