import type { Metadata } from 'next'
import LeadForm from '../LeadForm'
import Track from '../Track'
import { Foot, Top } from '../Chrome'

// kochitolabs.com/apps: app adoption. For the owner of a small app that still
// has users and no longer has their time: we keep it working for a share of
// what it earns. Facts on this page are sourced in apps/venture (private
// notes); change them there first.
const TITLE = 'We keep your app working, for a share of what it earns'
const DESCRIPTION = 'You built an app, people still use it, and you have no time for it. We do the platform migrations, the fixes and the support. No fee: a share of revenue, and you keep the app.'

export const metadata: Metadata = {
  title: 'App adoption',
  description: DESCRIPTION,
  alternates: { canonical: '/apps' },
  openGraph: { title: `${TITLE} · Kochito Labs`, description: DESCRIPTION, url: 'https://kochitolabs.com/apps', siteName: 'Kochito Labs', type: 'website' },
}

export default function AppAdoption() {
  return (
    <div className="kl-apps">
      <Track page="apps" />
      <Top />
      <main id="main">
        <div className="kl-wrap kl-hero">
          <div>
            <p className="kl-eyebrow">App adoption</p>
            <h1>
              Your app still has users. <em>We’ll keep it working.</em>
            </h1>
            <p className="kl-lede">
              You built it, people still pay for it, and you have no time for it. We take over the migrations, the fixes and the support email. You keep the app. No fee: an agreed share of what it earns.
            </p>
            <LeadForm
              page="apps"
              emailPlaceholder="you@yourapp.com"
              detailLabel="Link to the app"
              detailPlaceholder="https://apps.shopify.com/your-app"
              detailHint="A Shopify App Store or Apple App Store link. Leave it empty if you would rather talk first."
              button="Check my app, free"
              done="Your app’s report will be in your inbox within one business day."
            />
            <p className="kl-fine">The report is yours whether or not you ever talk to us again: what breaks at the next platform deadline, what reviewers say is broken now, and what fixing it involves.</p>
          </div>

          <figure className="kl-pic">
            <div className="kl-pair" aria-hidden="true">
              <div className="kl-sheet">
                <p className="kl-sheet-tag">
                  <span>Today</span>
                </p>
                <div className="kl-app-head">
                  <span className="kl-app-icon">A</span>
                  <span>
                    <span className="kl-app-name">Your app</span>
                    <span className="kl-app-sub">Updated 14 months ago</span>
                  </span>
                </div>
                <ul className="kl-log">
                  <li>
                    <b>Platform notice</b>
                    The API it is built on is being turned off.
                  </li>
                  <li>
                    <b>Support inbox</b>
                    31 unanswered.
                  </li>
                  <li>
                    <b>You</b>
                    Busy with the thing you do now.
                  </li>
                </ul>
                <span className="kl-chip bad">Breaks at the deadline</span>
              </div>
              <div className="kl-sheet kl-after">
                <p className="kl-sheet-tag">
                  <span>Adopted</span>
                </p>
                <div className="kl-app-head">
                  <span className="kl-app-icon">A</span>
                  <span>
                    <span className="kl-app-name">Your app</span>
                    <span className="kl-app-sub">Updated this week</span>
                  </span>
                </div>
                <ul className="kl-log">
                  <li>
                    <b>Platform notice</b>
                    Migrated. You approved the release.
                  </li>
                  <li>
                    <b>Support inbox</b>
                    Answered within a day.
                  </li>
                  <li>
                    <b>You</b>
                    Still the owner. A statement every month.
                  </li>
                </ul>
                <span className="kl-chip good">Ready for the deadline</span>
              </div>
            </div>
            <figcaption>A drawing, not a customer. The free report on your own app says what is true for it.</figcaption>
          </figure>
        </div>

        <section className="kl-band" aria-labelledby="how">
          <div className="kl-wrap">
            <h2 id="how">How it works</h2>
            <ol className="kl-three">
              <li>
                <span className="n">01</span>
                <h3>Send the link</h3>
                <p>Within one business day you get a report on your app: what stops working and when, what users are complaining about, and how much work it is.</p>
              </li>
              <li>
                <span className="n">02</span>
                <h3>Agree on a share</h3>
                <p>If you want us, we propose a share of revenue in writing, sized to how much work the app needs. Nothing is owed up front, and nothing if the app earns nothing.</p>
              </li>
              <li>
                <span className="n">03</span>
                <h3>We do the work, you approve it</h3>
                <p>You give access to the code. Every change is a pull request you can read, and nothing ships until you say so. Support email forwards to us.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="kl-band tint" aria-labelledby="terms">
          <div className="kl-wrap kl-two">
            <div>
              <h2 id="terms">The terms, in plain words</h2>
              <p>An app that still earns is worth more alive than abandoned or sold for parts. Selling it means finding a buyer and handing over your customers. Hiring an agency means paying before you know whether it is worth it. This is neither.</p>
            </div>
            <div>
              <ul className="kl-list">
                <li>No fee, ever. A share of revenue, agreed in writing first</li>
                <li>You own the app, the code, the accounts and the customers</li>
                <li>You approve every release</li>
                <li>Either of us can end it with 30 days’ notice, and you keep all the work</li>
                <li>A monthly statement: what we did, what it earned</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="kl-band" aria-labelledby="who">
          <div className="kl-wrap kl-two">
            <div>
              <h2 id="who">Who does the work</h2>
              <p>Kochito Labs is a small company, and the engineering is done by AI agents. That is what makes a revenue share work on an app too small for an agency to bother with.</p>
              <p>It is also why you approve every release. The agents write the code and the tests; you, or anyone you trust, read the change before it reaches your users.</p>
            </div>
            <div className="kl-faq">
              <h2>Questions</h2>
              <details>
                <summary>Which apps do you take?</summary>
                <p>Shopify apps and iPhone apps with paying users, built by one person or a small team who have moved on to other work. If yours is something else, send it anyway and we will say plainly whether we can help.</p>
              </details>
              <details>
                <summary>What access do you need?</summary>
                <p>Read and write access to the code repository, so we can open pull requests. You keep the developer account and do the release yourself, or give us a limited role for it. We never ask for your password.</p>
              </details>
              <details>
                <summary>What if the app earns very little?</summary>
                <p>Then our share is very little, and that is our risk. The free report will say honestly if we think the app is not worth saving.</p>
              </details>
              <details>
                <summary>Do you buy apps?</summary>
                <p>Not today. If you would rather sell, say so in your email and we will tell you if that changes.</p>
              </details>
            </div>
          </div>
        </section>

        <section className="kl-wrap kl-close">
          <h2>Find out what breaks, and when.</h2>
          <p className="kl-lede" style={{ margin: '0 auto 14px' }}>
            The report is free and takes you one link.
          </p>
          <a className="kl-btn" href="#start">
            Check my app, free
          </a>
        </section>
      </main>
      <Foot />
    </div>
  )
}
