import Link from 'next/link'
import { listApps, type AppCard } from '@/lib/surf/apps'
import { AppTile, Footer, GITHUB, TESTFLIGHT, TopBar, TubeMan } from './parts'

export const dynamic = 'force-dynamic'

export default async function SurfLanding() {
  let top: AppCard[] = []
  try {
    top = await listApps('top', null, 8)
  } catch (e) {
    console.error('[surf] landing gallery', (e as Error).message)
  }

  return (
    <main className="wrap">
      <TopBar />

      <section className="hero">
        <div>
          <h1 className="head">
            <span className="stroke">Token</span><br />
            <span className="stroke yellow">Surfers</span>
          </h1>
          <p className="tag">vibe code while you surf. a brainrot coding agent builds little apps on your phone; you play a runner while it types. every token is a coin.</p>
          <div className="ctas">
            {TESTFLIGHT ? (
              <a className="key" href={TESTFLIGHT}>get the beta on TestFlight 🏄</a>
            ) : (
              <span className="key" aria-disabled="true">TestFlight beta: soon 🏄</span>
            )}
            <a className="key ink" href={GITHUB} target="_blank" rel="noreferrer">source on GitHub</a>
            <Link className="key white" href="/surf/gallery">browse the gallery</Link>
          </div>
        </div>
        <div className="art">
          <div className="phone"><img src="/surf/shots/studio.jpg" alt="Splat writing an app while the runner plays underneath" width={540} height={1174} /></div>
          <TubeMan className="tube" />
        </div>
      </section>

      <section className="section">
        <h2 className="head stroke">how it goes</h2>
        <div className="steps">
          <div className="card step"><div className="n">1</div><h3>you type a thing</h3><p>"a pomodoro timer that screams at me". Splat, the agent, writes it as one file, live, with a brainrot voiceover. so it's 3am. my user pastes 2,000 lines.</p></div>
          <div className="card step"><div className="n">2</div><h3>you surf while it cooks</h3><p>every streamed token is a coin on the track. every tool call is a train. bugs it finds crawl onto the rails; stomp them. a shipped build rains confetti.</p></div>
          <div className="card step"><div className="n">3</div><h3>it runs. you ship it.</h3><p>the app runs on your phone. publish it to the gallery, get upvotes, remix other people's. one handle for the gallery and the world leaderboard.</p></div>
        </div>
      </section>

      <section className="section">
        <div className="shots">
          <figure><div className="phone"><img src="/surf/shots/game.jpg" alt="Token Surfers, the runner" width={540} height={1174} /></div><figcaption>trains, coins, ramps</figcaption></figure>
          <figure><div className="phone"><img src="/surf/shots/gameover.jpg" alt="game over card with the world rank" width={540} height={1174} /></div><figcaption>#n in the world</figcaption></figure>
          <figure><div className="phone"><img src="/surf/shots/home.jpg" alt="the home screen" width={540} height={1174} /></div><figcaption>AITA for wanting an app that…</figcaption></figure>
        </div>
      </section>

      <section className="section">
        <h2 className="head stroke">fresh off the rails</h2>
        {top.length ? (
          <div className="grid">{top.map((a) => <AppTile key={a.id} app={a} />)}</div>
        ) : (
          <div className="card empty">nothing published yet. the first one gets the throne.</div>
        )}
        <p style={{ marginTop: 14 }}><Link className="key white" href="/surf/gallery">the whole gallery →</Link></p>
      </section>

      <Footer />
    </main>
  )
}
