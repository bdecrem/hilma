import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Md from '../Md'
import { KEY, LETTERS, readBlind } from '../content'

export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return [...LETTERS, 'instrument'].map(file => ({ file }))
}

type Props = { params: Promise<{ file: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { file } = await params
  const title = file === 'instrument' ? 'MRD · blind review · the instrument' : `MRD · blind review · dossier ${file}`
  return { title, openGraph: { url: `https://ola.cx/mrd/dossiers/review/${file}`, title } }
}

export default async function Page({ params }: Props) {
  const { file } = await params
  const isInstrument = file === 'instrument'
  if (!isInstrument && !KEY[file]) notFound()
  const text = readBlind(isInstrument ? 'instrument.md' : `dossier-${file}.md`)
  const i = LETTERS.indexOf(file)

  return (
    <main className="wrap">
      <header className="top">
        <div className="eyebrow">
          <span><a href="/mrd/dossiers">MRD · six new dossiers</a> · <a href="/mrd/dossiers/review">blind review</a> · {isInstrument ? 'the instrument' : `dossier ${file}`}</span>
          {!isInstrument && (
            <span>
              {i > 0 && <a href={`/mrd/dossiers/review/${LETTERS[i - 1]}`}>← {LETTERS[i - 1]}</a>}
              {i > 0 && i < LETTERS.length - 1 && ' · '}
              {i < LETTERS.length - 1 && <a href={`/mrd/dossiers/review/${LETTERS[i + 1]}`}>{LETTERS[i + 1]} →</a>}
            </span>
          )}
        </div>
        {isInstrument ? (
          <h1>The instrument, <em>as the reviewer read it.</em></h1>
        ) : (
          <>
            <h1>Dossier {file}: {KEY[file].country}</h1>
            <p className="lede">
              The packet as the reviewer saw it. Key: {KEY[file].source === 'new'
                ? <><span className="flag">experimental</span>, coded by Claude for this project.</>
                : <>an MRD original, 2023 edition, coded by the Migrant Rights Initiative.</>}
            </p>
          </>
        )}
      </header>
      <article className="panel rv-report">
        {isInstrument ? <pre className="rv-pre">{text}</pre> : <Md text={text.replace(/^# .*\n/, '')} />}
      </article>
    </main>
  )
}
