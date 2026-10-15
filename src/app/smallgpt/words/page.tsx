import type { Metadata } from 'next'
import Explorer from '../explorer/Explorer'
import '../explorer/explorer.css'

export const metadata: Metadata = {
  title: 'smallgpt — 30,000 words, layer by layer',
  description:
    'The 30,000 most common Usenet words, placed by what the smallgpt model makes of them before attention, halfway through, and after all six layers.',
  openGraph: { url: 'https://ola.cx/smallgpt/words', images: [{ url: '/smallgpt/words/og.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', images: ['/smallgpt/words/og.png'] },
}

const SOURCES = [
  { label: 'layer 0', dir: '/smallgpt/words/L0' },
  { label: 'layer 3', dir: '/smallgpt/words/L3' },
  { label: 'layer 6', dir: '/smallgpt/words/L6' },
]

export default function WordsPage() {
  return (
    <main className="sgx">
      <a className="sgx-back" href="/smallgpt">
        ← smallgpt
      </a>
      <h1>30,000 words, layer by layer</h1>
      <p className="sgx-lead">
        The token explorer can only place single tokens. Here every one of the 30,000 most common words gets a place
        from inside the model: each word was found in about 20 real posts, the posts were run through the model, and
        the 320 numbers at the word were read after layer 0 (before any attention: only the word’s last piece), layer 3
        and layer 6, then averaged. Switch layers to watch spelling turn into meaning: at layer 0 Gorbachev sits next to
        other words ending in v, at layer 6 next to Yeltsin, Nixon and Sauron.
      </p>
      <Explorer
        sources={SOURCES}
        words
        start={{ a: 'king', b: 'man', c: 'woman' }}
        hint="Try Gorbachev, Challenger or beer and switch layers. At layer 0 a word is only its last piece, so its neighbours rhyme; by layer 6 they mean something. king − man + woman never reaches queen here: by layer 6 it lands on thief, creature, paladin, knight."
      />
    </main>
  )
}
