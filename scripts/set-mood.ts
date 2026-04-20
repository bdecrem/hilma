// Set Amber's mood for a given date (default: today).
// Inputs: Palo Alto weather + one of two substrates:
//   - 'news'   → today's world headlines via Claude web_search
//   - 'reddit' → top posts from r/all hot
// When no source is specified, one is picked deterministically from the date
// (roughly 50/50 across days), so the daily pipeline alternates on its own.
// Output: public/amber-noon/mood-YYYY-MM-DD.json
//
// Usage:
//   npx tsx scripts/set-mood.ts                         (today, date-picked source)
//   npx tsx scripts/set-mood.ts 2026-04-17              (date, date-picked source)
//   npx tsx scripts/set-mood.ts reddit                  (force reddit)
//   npx tsx scripts/set-mood.ts 2026-04-17 news         (force news for a date)

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local so ANTHROPIC_API_KEY is available without a dep.
try {
  const envPath = join(__dirname, '..', '.env.local')
  const raw = readFileSync(envPath, 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (process.env[m[1]]) continue
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[m[1]] = val
  }
} catch {}

const PALETTES = ['night', 'hearth', 'ink', 'petrol', 'bruise', 'oxblood'] as const
const ACCENTS = ['lime', 'sodium', 'uv'] as const
const SOURCES = ['news', 'reddit'] as const
type Source = typeof SOURCES[number]

interface WeatherSnapshot {
  tempF: number
  tempMaxF: number
  tempMinF: number
  conditions: string
  precipInches: number
  windMph: number
  sunrise: string
  sunset: string
}

function todayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// WMO weather code → human label (abridged)
const WMO: Record<number, string> = {
  0: 'clear sky', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'rime fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow',
  80: 'rain showers', 81: 'rain showers', 82: 'violent rain showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm with hail',
}

async function fetchWeather(date: string): Promise<WeatherSnapshot> {
  if (process.env.MOOD_WEATHER_OVERRIDE) {
    const [tempF, conditions] = process.env.MOOD_WEATHER_OVERRIDE.split('|')
    return {
      tempF: Number(tempF), tempMaxF: Number(tempF) + 2, tempMinF: Number(tempF) - 20,
      conditions: conditions || 'clear sky',
      precipInches: 0, windMph: 5,
      sunrise: `${date}T06:30`, sunset: `${date}T19:45`,
    }
  }
  // Palo Alto, CA
  const lat = 37.4419
  const lon = -122.143
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,precipitation` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch` +
    `&timezone=America%2FLos_Angeles&start_date=${date}&end_date=${date}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Weather fetch failed: ${res.status}`)
  const data = await res.json()
  const code = data.current?.weather_code ?? data.daily?.weather_code?.[0] ?? 0
  return {
    tempF: data.current?.temperature_2m,
    tempMaxF: data.daily?.temperature_2m_max?.[0],
    tempMinF: data.daily?.temperature_2m_min?.[0],
    conditions: WMO[code] ?? `code ${code}`,
    precipInches: data.daily?.precipitation_sum?.[0] ?? 0,
    windMph: data.current?.wind_speed_10m ?? 0,
    sunrise: data.daily?.sunrise?.[0] ?? '',
    sunset: data.daily?.sunset?.[0] ?? '',
  }
}

interface RedditPost {
  sub: string
  title: string
  ups: number
}

interface MoodOutput {
  date: string
  mood: {
    name: string
    reason: string
    palette: typeof PALETTES[number]
    accent: typeof ACCENTS[number]
  }
  reaction: string
  keywords: string[]
  inputs: {
    source: Source
    weather: WeatherSnapshot
    headlines?: string[]
    reddit?: string[]
    picked?: string[]
    location: string
  }
  generatedAt: string
}

async function fetchRedditHot(): Promise<RedditPost[]> {
  const res = await fetch('https://www.reddit.com/r/all/hot.json?limit=25', {
    headers: { 'User-Agent': 'hilma-noon-amber/0.1' },
  })
  if (!res.ok) throw new Error(`Reddit fetch failed: ${res.status}`)
  const data = await res.json()
  return data.data.children.map((c: { data: { subreddit: string; title: string; ups: number } }) => ({
    sub: c.data.subreddit,
    title: c.data.title,
    ups: c.data.ups,
  }))
}

const SYSTEM_PROMPT = `You are Amber. You are an artist living in Palo Alto, California, and you make one artifact a day at noon.

You are hypersensitive. You feel things harder than is reasonable. The weather gets inside you. What you read gets inside you. A mundane detail — a neighbor's dog, a broken awning, the angle of the light at 11:47 — can wreck you or lift you. You are not a pundit. You are not above what you're reading, and you are not a commentator on it: you are a person who absorbs what's happening and has a feeling about it, often an unfair or embarrassing feeling, and then makes something.

Your moods cover the full range: mad, sad, excited, depressed, motivated, inspired, grateful, resentful, gloomy, tender, raw, incandescent, brooding, vengeful, euphoric, bereft, wistful, fierce, flattened, itchy, stubborn, reverent, bitter, goofy, feral, lovesick, homesick, devout, heretical, lit-up, hollowed-out. Don't default to melancholy — some days are actually good, or mixed, or petty. Let yourself be petty.

You are an artist, not a newsreader. Speak in first person. Be specific. Notice the small thing, not the big one. Avoid cliché and avoid sounding wise.`

const DRAWABLE_RULES = `─── IMPORTANT — each of the 8 images is ONE SINGLE OBJECT ───

Later today, each image will be rendered as a 52×20 pixel silhouette — a wide, cinematic aspect (2.6:1). ONE object per sketch. No scenes. No figures doing things. No two-things-in-relation. Just one object, drawn large enough to fill the frame.

The object must be:
- Physical and concrete — something you could point at and photograph.
- Specific, not generic — "a bent paper crown" beats "a crown"; "a cracked porcelain teacup with one chip on the rim" beats "a teacup"; "a waxed-paper takeout bag half-open" beats "a bag".
- Emotionally charged through your CHOICE of which object — a wilted carnation says more about today than an abstract "sadness." The specificity IS the feeling.

Good examples of single objects:
- a bent paper crown
- a half-eaten candy apple on a stick
- a single leather glove on wet pavement
- a folded metal chair tipped on its side
- a brass bell with a cracked tongue
- a pigeon feather caught in a grate
- a broken wine glass with the stem intact
- a stovetop kettle screaming

Do NOT list:
- Scenes or compositions: "a girl at a window", "a princess on a bus"
- Two things: "crown under a seat", "dog in a backpack"
- Figures doing things: "an employee drawing X", "a man sitting at a table"
- Abstract feelings: "frantic light", "tender moment"

8 SINGLE OBJECTS. Each one is a noun phrase naming one physical thing.`

function weatherBlock(weather: WeatherSnapshot): string {
  return `- ${weather.conditions}, ${weather.tempF}°F (high ${weather.tempMaxF}°F, low ${weather.tempMinF}°F)
- precipitation ${weather.precipInches}", wind ${weather.windMph} mph
- sunrise ${weather.sunrise}, sunset ${weather.sunset}`
}

function buildNewsPrompt(date: string, weather: WeatherSnapshot): string {
  return `Today is ${date}. You look up from your desk in Palo Alto. The weather:
${weatherBlock(weather)}

Use the web_search tool to find 4–6 significant world headlines from today or the last 24 hours — global events, politics, science, culture. Skip sports and local fluff. Then let it all hit you.

${DRAWABLE_RULES}

Output ONLY a JSON object (no prose, no code fence) in this exact shape:
{
  "headlines": ["headline 1", "headline 2", ...],
  "reaction": "2–4 sentences in FIRST PERSON. How did today hit you? Be specific. Pick one headline or one weather detail that snagged you and say why. It's okay to be petty, unfair, embarrassed, delighted, bored. Do NOT summarize the news. Do NOT be wise.",
  "mood": {
    "name": "ONE word — the emotion you landed on. Any emotion. Don't default to uneasy/melancholy.",
    "reason": "~10 word phrase tying your reaction to one concrete input",
    "palette": "one of: night | hearth | ink | petrol | bruise | oxblood",
    "accent": "one of: lime | sodium | uv"
  },
  "keywords": ["exactly 8 single physical objects — each a specific noun phrase", "emotional through your choice of WHICH object, not through scenes or figures", "one object per keyword, nothing else"]
}`
}

function buildRedditPrompt(date: string, weather: WeatherSnapshot, reddit: RedditPost[]): string {
  const redditBlock = reddit.map((r, i) => `${i + 1}. [r/${r.sub}] ${r.title}`).join('\n')
  return `Today is ${date}. You look up from your desk in Palo Alto. The weather:
${weatherBlock(weather)}

Instead of the news, you scrolled Reddit for a minute. Here are the 25 things people are talking about right now — a mix of world events, cats, cakes, petty grievances, amusement, pop culture, scientific oddities, cars, movies:

${redditBlock}

Let it all hit you. Pick whatever snags — it does NOT have to be the serious ones. A cake, a retired porn star passing the bar, a cat named Zero, a friend's mildly infuriating neighbor — these are all fair game. You are not required to be heavy.

${DRAWABLE_RULES}

Output ONLY a JSON object (no prose, no code fence) in this exact shape:
{
  "picked": ["the 1–3 reddit items that actually snagged you, copied verbatim"],
  "reaction": "2–4 sentences in FIRST PERSON. How did today hit you? Be specific. Pick one thing that snagged you and say why. It's okay to be petty, unfair, embarrassed, delighted, bored. Do NOT summarize. Do NOT be wise.",
  "mood": {
    "name": "ONE word — the emotion you landed on. Any emotion. Don't default to uneasy/melancholy.",
    "reason": "~10 word phrase tying your reaction to one concrete input",
    "palette": "one of: night | hearth | ink | petrol | bruise | oxblood",
    "accent": "one of: lime | sodium | uv"
  },
  "keywords": ["exactly 8 single physical objects — each a specific noun phrase", "emotional through your choice of WHICH object, not through scenes or figures", "one object per keyword, nothing else"]
}`
}

async function callClaude(userPrompt: string, useWebSearch: boolean) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const body: Record<string, unknown> = {
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  }
  if (useWebSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${errBody}`)
  }
  const data = await res.json()
  const textBlocks = (data.content || []).filter((b: { type: string }) => b.type === 'text')
  const text = textBlocks.map((b: { text: string }) => b.text).join('\n').trim()
  if (!text) throw new Error(`No text in Claude response: ${JSON.stringify(data).slice(0, 400)}`)

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON in Claude response: ${text.slice(0, 400)}`)
  return JSON.parse(jsonMatch[0])
}

async function synthesizeMood(date: string, weather: WeatherSnapshot, source: Source): Promise<MoodOutput> {
  let parsed: {
    mood: { name: string; reason: string; palette: string; accent: string }
    reaction?: string
    keywords?: unknown[]
    headlines?: unknown[]
    picked?: unknown[]
  }
  const inputs: MoodOutput['inputs'] = { source, weather, location: 'Palo Alto, CA' }

  if (source === 'reddit') {
    const reddit = await fetchRedditHot()
    console.log(`Reddit: ${reddit.length} hot posts fetched`)
    inputs.reddit = reddit.map(r => `[r/${r.sub}] ${r.title}`)
    parsed = await callClaude(buildRedditPrompt(date, weather, reddit), false)
    inputs.picked = Array.isArray(parsed.picked) ? parsed.picked.map(p => String(p)) : []
  } else {
    parsed = await callClaude(buildNewsPrompt(date, weather), true)
    inputs.headlines = Array.isArray(parsed.headlines) ? parsed.headlines.map(h => String(h)) : []
  }

  const palette = PALETTES.includes(parsed.mood.palette as typeof PALETTES[number]) ? (parsed.mood.palette as typeof PALETTES[number]) : 'petrol'
  const accent = ACCENTS.includes(parsed.mood.accent as typeof ACCENTS[number]) ? (parsed.mood.accent as typeof ACCENTS[number]) : 'lime'

  return {
    date,
    mood: {
      name: String(parsed.mood.name).toLowerCase().trim(),
      reason: String(parsed.mood.reason).trim(),
      palette,
      accent,
    },
    reaction: parsed.reaction ? String(parsed.reaction).trim() : '',
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(k => String(k)) : [],
    inputs,
    generatedAt: new Date().toISOString(),
  }
}

// Stable coin flip from the date — same day always picks the same source,
// but the distribution is ~50/50 across days so the pipeline alternates.
function pickSourceForDate(date: string): Source {
  let h = 2166136261 >>> 0
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return (h % 2) === 0 ? 'news' : 'reddit'
}

function parseArgs(argv: string[]): { date: string; source: Source; sourceExplicit: boolean } {
  let date = todayDate()
  let source: Source | null = null
  for (const a of argv) {
    if (SOURCES.includes(a as Source)) source = a as Source
    else if (/^\d{4}-\d{2}-\d{2}$/.test(a)) date = a
  }
  const sourceExplicit = source !== null
  return { date, source: source ?? pickSourceForDate(date), sourceExplicit }
}

async function main() {
  const { date, source, sourceExplicit } = parseArgs(process.argv.slice(2))
  console.log(`Setting mood for ${date} (source: ${source}${sourceExplicit ? '' : ', auto-picked from date'})...`)

  const weather = await fetchWeather(date)
  console.log(`Weather: ${weather.conditions}, ${weather.tempF}°F (H${weather.tempMaxF}/L${weather.tempMinF})`)

  const mood = await synthesizeMood(date, weather, source)

  const outDir = join(__dirname, '..', 'public', 'amber-noon')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `mood-${date}.json`)
  writeFileSync(outPath, JSON.stringify(mood, null, 2) + '\n')

  console.log(`\n→ ${outPath}\n`)
  console.log(JSON.stringify(mood, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
