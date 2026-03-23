// Citrus spring background picker — every piece gets a unique bg
// Import this and call pickBackground() — it returns a CSS background value

const SOLIDS = [
  '#FFF8E7', // warm cream
  '#FFECD2', // soft peach
  '#FFFDE7', // pale lemon
  '#FFF0F0', // light blush
  '#FFE0DD', // coral wash
  '#E8F5E9', // mint mist
  '#FAFAFA', // warm white
  '#F9D423', // bold mango
  '#FF6B81', // bold grapefruit
  '#B4E33D', // bold lime
  '#FF4E50', // bold coral
  '#FC913A', // bold tangerine
]

const GRADIENTS = [
  'linear-gradient(135deg, #FFECD2, #FFFDE7)',
  'linear-gradient(135deg, #FFF0F0, #FFFDE7)',
  'linear-gradient(180deg, #E8F5E9, #FFF8E7)',
  'linear-gradient(135deg, #FFE0DD, #FFECD2)',
  'linear-gradient(180deg, #FFFDE7, #FFF0F0)',
  'linear-gradient(135deg, #FFF8E7, #E8F5E9)',
  'linear-gradient(180deg, #FFECD2, #FFF0F0)',
  'linear-gradient(135deg, #F9D423, #FC913A)',
  'linear-gradient(135deg, #FF6B81, #FC913A)',
  'linear-gradient(180deg, #B4E33D, #FFF8E7)',
  'linear-gradient(135deg, #FF4E50, #F9D423)',
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
    ['#FFECD2', '#FFFDE7'],
    ['#FFF0F0', '#FFFDE7'],
    ['#E8F5E9', '#FFF8E7'],
    ['#FFE0DD', '#FFECD2'],
    ['#FFFDE7', '#FFF0F0'],
    ['#FFF8E7', '#E8F5E9'],
    ['#F9D423', '#FC913A'],
    ['#FF6B81', '#FC913A'],
    ['#B4E33D', '#FFF8E7'],
    ['#FFE0DD', '#E8F5E9'],
    ['#FFECD2', '#FFF0F0'],
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
