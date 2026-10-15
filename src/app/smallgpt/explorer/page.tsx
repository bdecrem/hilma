import type { Metadata } from 'next'
import Explorer from './Explorer'
import './explorer.css'

export const metadata: Metadata = {
  title: 'smallgpt — embedding explorer',
  description:
    'Every token of the smallgpt Usenet model on a map: hover, search, nearest neighbours in the full 320 dimensions, word arithmetic, a 3-D view.',
  openGraph: { url: 'https://ola.cx/smallgpt/explorer' },
}

export default function ExplorerPage() {
  return (
    <main className="sgx">
      <a className="sgx-back" href="/smallgpt">
        ← smallgpt
      </a>
      <h1>Embedding explorer</h1>
      <p className="sgx-lead">
        The Usenet model’s embedding table from step 7: 8,192 tokens, 320 numbers each. The map squeezes them to 2 (or
        3) dimensions; the neighbour lists are measured in all 320.
      </p>
      <Explorer />
    </main>
  )
}
