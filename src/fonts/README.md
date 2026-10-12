# Fonts

Every web font on this site, bundled. Pages load them with `next/font/local`,
OG images read the `.ttf` instances from disk, and nothing at build time
fetches a font from Google Fonts. Google was the cause of every font-related
build failure on Vercel (2026-09-05, twice on 2026-10-11, again on 2026-10-12:
a network timeout or an unexpected font URL in its CSS takes every deploy down
with it). `pnpm build` now refuses to run while anything in `src/` still
imports `next/font/google` or fetches `fonts.googleapis.com` in an OG image
(`scripts/fonts/check.mjs`).

**Generated** by `pnpm fonts:sync` from `fonts.json` and the google/fonts
repo (`scripts/fonts/sync.mjs` + `build.py`): latin + latin-ext ranges,
unhinted, every axis but `wght` pinned to its default. Do not edit the font
files or this README by hand.

## Adding a family

1. Add it to `fonts.json` (`"italic": true` for an italic face, `"weights"`
   for a static family's weights, `"og"` for `.ttf` instances an OG image needs).
2. `pnpm fonts:sync "Family Name"` (first run creates `scripts/fonts/.venv`).
3. Paste the snippet below into the layout, with the variable name the page's
   CSS expects. Paths are relative to `src/app/<page>/`; a page one level
   deeper (`src/app/design/<page>/`) uses `../../../fonts/…`.
4. Commit `src/fonts/` with the page.

An OG image reads its font with `readFile(path.join(process.cwd(),
'src/fonts/<dir>/<Family>-<w>.ttf'))` — a literal path, so Vercel's file
tracing bundles it. A share-card route that renders at request time must also
list the file in `outputFileTracingIncludes` in `next.config.ts` (as
`/drum/og` does).

## Catalog

Built 2026-10-12.

### Anton

static · `ofl/anton` · Anton-400.woff2 30 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/anton/Anton-400.woff2', weight: '400', variable: '--font-anton', display: 'swap' })
```

### Archivo Black

static · `ofl/archivoblack` · ArchivoBlack-400.woff2 13 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/archivo-black/ArchivoBlack-400.woff2', weight: '400', variable: '--font-archivo-black', display: 'swap' })
```

OG: `archivo-black/ArchivoBlack-400.ttf` → `{ name: 'Archivo Black', weight: 400, style: 'normal' }`

### Baloo 2

variable (wght 400–800) · `ofl/baloo2` · Baloo2.woff2 51 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/baloo-2/Baloo2.woff2', weight: '400 800', variable: '--font-baloo-2', display: 'swap' })
```

### Bangers

static · `ofl/bangers` · Bangers-400.woff2 22 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/bangers/Bangers-400.woff2', weight: '400', variable: '--font-bangers', display: 'swap' })
```

### Barlow Condensed

static · `ofl/barlowcondensed` · BarlowCondensed-500.woff2 21 KB, BarlowCondensed-600.woff2 21 KB, BarlowCondensed-700.woff2 21 KB

```ts
import localFont from 'next/font/local'
const font = localFont({
  src: [
    { path: '../../fonts/barlow-condensed/BarlowCondensed-500.woff2', weight: '500' },
    { path: '../../fonts/barlow-condensed/BarlowCondensed-600.woff2', weight: '600' },
    { path: '../../fonts/barlow-condensed/BarlowCondensed-700.woff2', weight: '700' },
  ],
  variable: '--font-barlow-condensed', display: 'swap',
})
```

### Bowlby One

static · `ofl/bowlbyone` · BowlbyOne-400.woff2 23 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/bowlby-one/BowlbyOne-400.woff2', weight: '400', variable: '--font-bowlby-one', display: 'swap' })
```

### Bricolage Grotesque

variable (opsz 12–96, wght 200–800, wdth 75–100) · `ofl/bricolagegrotesque` · BricolageGrotesque.woff2 57 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/bricolage-grotesque/BricolageGrotesque.woff2', weight: '200 800', variable: '--font-bricolage-grotesque', display: 'swap' })
```

OG: `bricolage-grotesque/BricolageGrotesque-800.ttf` → `{ name: 'Bricolage Grotesque', weight: 800, style: 'normal' }`

### Bungee

static · `ofl/bungee` · Bungee-400.woff2 32 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/bungee/Bungee-400.woff2', weight: '400', variable: '--font-bungee', display: 'swap' })
```

### Caveat

variable (wght 400–700) · `ofl/caveat` · Caveat.woff2 86 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/caveat/Caveat.woff2', weight: '400 700', variable: '--font-caveat', display: 'swap' })
```

### DM Mono

static · `ofl/dmmono` · DMMono-400.woff2 11 KB, DMMono-500.woff2 11 KB

```ts
import localFont from 'next/font/local'
const font = localFont({
  src: [
    { path: '../../fonts/dm-mono/DMMono-400.woff2', weight: '400' },
    { path: '../../fonts/dm-mono/DMMono-500.woff2', weight: '500' },
  ],
  variable: '--font-dm-mono', display: 'swap',
})
```

OG: `dm-mono/DMMono-400.ttf` → `{ name: 'DM Mono', weight: 400, style: 'normal' }`

### Fraunces

variable (opsz 9–144, wght 100–900, SOFT 0–100, WONK 0–1) · `ofl/fraunces` · Fraunces.woff2 52 KB, Fraunces-Italic.woff2 63 KB

```ts
import localFont from 'next/font/local'
const font = localFont({
  src: [
    { path: '../../fonts/fraunces/Fraunces.woff2', style: 'normal' },
    { path: '../../fonts/fraunces/Fraunces-Italic.woff2', style: 'italic' },
  ],
  weight: '100 900',
  variable: '--font-fraunces', display: 'swap',
})
```

### Fredoka

variable (wght 300–700, wdth 75–125) · `ofl/fredoka` · Fredoka.woff2 30 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/fredoka/Fredoka.woff2', weight: '300 700', variable: '--font-fredoka', display: 'swap' })
```

### Gochi Hand

static · `ofl/gochihand` · GochiHand-400.woff2 20 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/gochi-hand/GochiHand-400.woff2', weight: '400', variable: '--font-gochi-hand', display: 'swap' })
```

### IM Fell English

static · `ofl/imfellenglish` · IMFellEnglish-400.woff2 68 KB, IMFellEnglish-400-Italic.woff2 71 KB

```ts
import localFont from 'next/font/local'
const font = localFont({
  src: [
    { path: '../../fonts/im-fell-english/IMFellEnglish-400.woff2', weight: '400' },
    { path: '../../fonts/im-fell-english/IMFellEnglish-400-Italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-im-fell-english', display: 'swap',
})
```

### IM Fell English SC

static · `ofl/imfellenglishsc` · IMFellEnglishSC-400.woff2 61 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/im-fell-english-sc/IMFellEnglishSC-400.woff2', weight: '400', variable: '--font-im-fell-english-sc', display: 'swap' })
```

### Instrument Sans

variable (wdth 75–100, wght 400–700) · `ofl/instrumentsans` · InstrumentSans.woff2 43 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/instrument-sans/InstrumentSans.woff2', weight: '400 700', variable: '--font-instrument-sans', display: 'swap' })
```

### Instrument Serif

static · `ofl/instrumentserif` · InstrumentSerif-400.woff2 18 KB, InstrumentSerif-400-Italic.woff2 19 KB

```ts
import localFont from 'next/font/local'
const font = localFont({
  src: [
    { path: '../../fonts/instrument-serif/InstrumentSerif-400.woff2', weight: '400' },
    { path: '../../fonts/instrument-serif/InstrumentSerif-400-Italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument-serif', display: 'swap',
})
```

### Inter

variable (opsz 14–32, wght 100–900) · `ofl/inter` · Inter.woff2 132 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/inter/Inter.woff2', weight: '100 900', variable: '--font-inter', display: 'swap' })
```

### Inter Tight

variable (wght 100–900) · `ofl/intertight` · InterTight.woff2 123 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/inter-tight/InterTight.woff2', weight: '100 900', variable: '--font-inter-tight', display: 'swap' })
```

### JetBrains Mono

variable (wght 100–800) · `ofl/jetbrainsmono` · JetBrainsMono.woff2 46 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/jetbrains-mono/JetBrainsMono.woff2', weight: '100 800', variable: '--font-jetbrains-mono', display: 'swap' })
```

### Montserrat

variable (wght 100–900) · `ofl/montserrat` · Montserrat.woff2 141 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/montserrat/Montserrat.woff2', weight: '100 900', variable: '--font-montserrat', display: 'swap' })
```

### Nunito

variable (wght 200–1000) · `ofl/nunito` · Nunito.woff2 58 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/nunito/Nunito.woff2', weight: '200 1000', variable: '--font-nunito', display: 'swap' })
```

### Patrick Hand

static · `ofl/patrickhand` · PatrickHand-400.woff2 26 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/patrick-hand/PatrickHand-400.woff2', weight: '400', variable: '--font-patrick-hand', display: 'swap' })
```

OG: `patrick-hand/PatrickHand-400.ttf` → `{ name: 'Patrick Hand', weight: 400, style: 'normal' }`

### Permanent Marker

static · `apache/permanentmarker` · PermanentMarker-400.woff2 29 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/permanent-marker/PermanentMarker-400.woff2', weight: '400', variable: '--font-permanent-marker', display: 'swap' })
```

### Quicksand

variable (wght 300–700) · `ofl/quicksand` · Quicksand.woff2 41 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/quicksand/Quicksand.woff2', weight: '300 700', variable: '--font-quicksand', display: 'swap' })
```

### Shantell Sans

variable (wght 300–800, INFM 0–100, BNCE -100–100, SPAC 0–100) · `ofl/shantellsans` · ShantellSans.woff2 96 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/shantell-sans/ShantellSans.woff2', weight: '300 800', variable: '--font-shantell-sans', display: 'swap' })
```

OG: `shantell-sans/ShantellSans-400.ttf` → `{ name: 'Shantell Sans', weight: 400, style: 'normal' }`; `shantell-sans/ShantellSans-700.ttf` → `{ name: 'Shantell Sans', weight: 700, style: 'normal' }`

### Source Serif 4

variable (wght 200–900, opsz 8–60) · `ofl/sourceserif4` · SourceSerif4.woff2 98 KB, SourceSerif4-Italic.woff2 78 KB

```ts
import localFont from 'next/font/local'
const font = localFont({
  src: [
    { path: '../../fonts/source-serif-4/SourceSerif4.woff2', style: 'normal' },
    { path: '../../fonts/source-serif-4/SourceSerif4-Italic.woff2', style: 'italic' },
  ],
  weight: '200 900',
  variable: '--font-source-serif-4', display: 'swap',
})
```

### Space Grotesk

variable (wght 300–700) · `ofl/spacegrotesk` · SpaceGrotesk.woff2 38 KB

```ts
import localFont from 'next/font/local'
const font = localFont({ src: '../../fonts/space-grotesk/SpaceGrotesk.woff2', weight: '300 700', variable: '--font-space-grotesk', display: 'swap' })
```

### Space Mono

static · `ofl/spacemono` · SpaceMono-400.woff2 17 KB, SpaceMono-700.woff2 17 KB

```ts
import localFont from 'next/font/local'
const font = localFont({
  src: [
    { path: '../../fonts/space-mono/SpaceMono-400.woff2', weight: '400' },
    { path: '../../fonts/space-mono/SpaceMono-700.woff2', weight: '700' },
  ],
  variable: '--font-space-mono', display: 'swap',
})
```
