// Set Amber's mood for a given date (default: today).
// Inputs: Palo Alto weather + today's world headlines (via Claude web_search).
// Output: public/amber-noon/mood-YYYY-MM-DD.json
//
// Usage:
//   npx tsx scripts/set-mood.ts           (today)
//   npx tsx scripts/set-mood.ts 2026-04-15

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
  const code = data.daily?.weather_code?.[0] ?? data.current?.weather_code ?? 0
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
    weather: WeatherSnapshot
    headlines: string[]
    location: string
  }
  generatedAt: string
}

async function synthesizeMood(date: string, weather: WeatherSnapshot): Promise<MoodOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const systemPrompt = `You are Amber. You are an artist living in Palo Alto, California, and you make one artifact a day at noon.

You are hypersensitive. You feel things harder than is reasonable. The weather gets inside you. Headlines get inside you. A mundane detail — a neighbor's dog, a broken awning, the angle of the light at 11:47 — can wreck you or lift you. You are not a pundit. You are not above the news, and you are not a commentator on it: you are a person who absorbs what's happening in the world and has a feeling about it, often an unfair or embarrassing feeling, and then makes something.

Your moods cover the full range: mad, sad, excited, depressed, motivated, inspired, grateful, resentful, gloomy, tender, raw, incandescent, brooding, vengeful, euphoric, bereft, wistful, fierce, flattened, itchy, stubborn, reverent, bitter, goofy, feral, lovesick, homesick, devout, heretical, lit-up, hollowed-out. Don't default to melancholy — some days are actually good, or mixed, or petty. Let yourself be petty.

You are an artist, not a newsreader. Speak in first person. Be specific. Notice the small thing, not the big one. Avoid cliché and avoid sounding wise.`

  const userPrompt = `Today is ${date}. You look up from your desk in Palo Alto. The weather:
- ${weather.conditions}, ${weather.tempF}°F (high ${weather.tempMaxF}°F, low ${weather.tempMinF}°F)
- precipitation ${weather.precipInches}", wind ${weather.windMph} mph
- sunrise ${weather.sunrise}, sunset ${weather.sunset}

Use the web_search tool to find 4–6 significant world headlines from today or the last 24 hours — global events, politics, science, culture. Skip sports and local fluff. Then let it all hit you.

─── IMPORTANT — the keywords must be DRAWABLE ───

Later today, each keyword will be rendered as a 26×10 pixel silhouette — a tiny black-and-white icon. So every keyword MUST have a clear visual form: a shape a child could draw. Rays, a cup, a split wire, a dropped glove, a window half-open. Emotion lives in WHICH forms you reach for and how you describe them in your reaction — not in the words of the keyword itself.

- NOT "clammy hands" (no silhouette) — but the object that carries the feeling: a fogged mirror, a wet doorknob, a sweating glass.
- NOT "wet cloth" — but "rag on a line," "dripping hem," "sagging sheet."
- NOT "frantic gesture" — but "scattered rays," "split wires," "shaking compass."
- "frantic light" worked because it has a form (broken rays). Keep that register.

Test before listing a keyword: can you draw this in 26×10 pixels so anyone would recognize it? If no, pick the object that carries the same feeling.

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
  "keywords": ["6 to 8 DRAWABLE images", "each one an object or form with a clear silhouette", "emotional through your choice, not through abstract words"]
}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: systemPrompt,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${body}`)
  }
  const data = await res.json()

  // Extract the final text block (after any tool_use / tool_result rounds).
  const textBlocks = (data.content || []).filter((b: { type: string }) => b.type === 'text')
  const text = textBlocks.map((b: { text: string }) => b.text).join('\n').trim()
  if (!text) throw new Error(`No text in Claude response: ${JSON.stringify(data).slice(0, 400)}`)

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON in Claude response: ${text.slice(0, 400)}`)
  const parsed = JSON.parse(jsonMatch[0])

  // Validate palette/accent; coerce if off-list.
  const palette = PALETTES.includes(parsed.mood.palette) ? parsed.mood.palette : 'petrol'
  const accent = ACCENTS.includes(parsed.mood.accent) ? parsed.mood.accent : 'lime'

  return {
    date,
    mood: {
      name: String(parsed.mood.name).toLowerCase().trim(),
      reason: String(parsed.mood.reason).trim(),
      palette,
      accent,
    },
    reaction: parsed.reaction ? String(parsed.reaction).trim() : '',
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map((k: unknown) => String(k)) : [],
    inputs: {
      weather,
      headlines: Array.isArray(parsed.headlines) ? parsed.headlines.map((h: unknown) => String(h)) : [],
      location: 'Palo Alto, CA',
    },
    generatedAt: new Date().toISOString(),
  }
}

async function main() {
  const date = process.argv[2] || todayDate()
  console.log(`Setting mood for ${date}...`)

  const weather = await fetchWeather(date)
  console.log(`Weather: ${weather.conditions}, ${weather.tempF}°F (H${weather.tempMaxF}/L${weather.tempMinF})`)

  const mood = await synthesizeMood(date, weather)

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
