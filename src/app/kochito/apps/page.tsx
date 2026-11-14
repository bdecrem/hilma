import type { Metadata } from 'next'
import LeadForm from '../LeadForm'
import PrVisual from '../PrVisual'
import Track from '../Track'
import { Foot, Top } from '../Chrome'

// kochitolabs.com/apps: maintenance for Shopify apps, paid as a share of the
// app's revenue. For the owner of a small app that still has paying merchants
// and no longer has their time. Every fact here (Shopify's dates, the terms)
// is sourced in Venture's private notes; change it there first.
const TITLE = 'Shopify app maintenance, paid as a share of revenue'
const DESCRIPTION = 'Your Shopify app still has paying merchants and you have no time for the 2027 platform changes. We do the migrations, the fixes and the support for a share of revenue. No fee, and you keep the app.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/apps' },
  openGraph: { title: `${TITLE} | Kochito Labs`, description: DESCRIPTION, url: 'https://kochitolabs.com/apps', siteName: 'Kochito Labs', type: 'website' },
}

const form = {
  page: 'apps',
  emailPlaceholder: 'name@yourcompany.com',
  button: 'Get a free report',
  under: 'Which of Shopify’s dates affect your app, and what the work involves. You can',
  moreLabel: 'add your App Store link now',
  detailLabel: 'Your app’s Shopify App Store link',
  detailPlaceholder: 'https://apps.shopify.com/your-app',
  done: 'Your report will arrive within one business day.',
}

export default function AppMaintenance() {
  return (
    <>
      <Track page="apps" />
      <Top current="apps" cta="Get a free report" />
      <main id="main">
        <div className="kl-wrap kl-hero">
          <div>
            <p className="kl-kicker">For Shopify app developers</p>
            <h1>Your app still has merchants. We keep it running.</h1>
            <p className="kl-lede">You built it, merchants still pay for it, and you have no time for Shopify’s 2027 changes. We take over the migrations, the bug fixes and the support inbox, for a share of what the app earns.</p>
            <LeadForm {...form} />
            <ul className="kl-trust">
              <li>
                <strong>No fee</strong>
              </li>
              <li>
                <strong>You keep</strong> the app
              </li>
              <li>
                <strong>You approve</strong> every release
              </li>
            </ul>
          </div>
          <PrVisual />
        </div>

        <section className="kl-band tint" aria-labelledby="dates">
          <div className="kl-wrap">
            <div className="kl-sec-head">
              <h2 id="dates">Shopify’s 2027 dates</h2>
              <p>Two platform changes take effect in early 2027. An app that nobody is maintaining will miss both.</p>
            </div>
            <ol className="kl-time">
              <li className="now">
                <span className="tag">In effect now</span>
                <time dateTime="2026-10-01">October 1, 2026</time>
                <p>Apps can no longer create script tags. A new install of an app that depends on them gets no storefront script.</p>
              </li>
              <li>
                <time dateTime="2027-01-01">January 1, 2027</time>
                <p>Public apps still on non-expiring access tokens are delisted and blocked from new installs.</p>
              </li>
              <li>
                <time dateTime="2027-03-01">March 1, 2027</time>
                <p>Script tags stop running on storefronts. The replacement, an app embed, has to be switched on by each merchant.</p>
              </li>
              <li>
                <time dateTime="2027-04-01">April 1, 2027</time>
                <p>Admin API requests made with non-expiring tokens are refused.</p>
              </li>
            </ol>
            <p className="kl-src">
              Sources: Shopify’s developer changelog, <a href="https://shopify.dev/changelog/online-store-script-tags-deprecation">script tags</a> (August 24, 2026) and <a href="https://shopify.dev/changelog/posts/expiring-offline-access-tokens-required-for-all-public-apps-as-of-january-1-2027">expiring access tokens</a> (May 20, 2026). Shopify has said it will review the March date in January.
            </p>
          </div>
        </section>

        <section className="kl-band" aria-labelledby="work">
          <div className="kl-wrap">
            <div className="kl-sec-head">
              <h2 id="work">What we take on</h2>
              <p>Everything it takes to keep a small app earning, so you can stay on what you do now.</p>
            </div>
            <div className="kl-cards two">
              <div className="kl-card plain">
                <h3>The 2027 migrations</h3>
                <p>Building the app embed that replaces your script tags, moving to expiring access tokens, and helping each merchant switch the embed on.</p>
              </div>
              <div className="kl-card plain">
                <h3>Bug fixes</h3>
                <p>Starting with what your recent reviews say is broken.</p>
              </div>
              <div className="kl-card plain">
                <h3>Merchant support</h3>
                <p>Your support address forwards to us. Merchants get an answer within one business day.</p>
              </div>
              <div className="kl-card plain">
                <h3>Platform upkeep</h3>
                <p>API version updates and App Store requirements, as Shopify announces them.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="kl-band dark" aria-labelledby="terms">
          <div className="kl-wrap">
            <div className="kl-sec-head">
              <h2 id="terms">The terms, in plain words.</h2>
              <p>Selling an app means finding a buyer and handing over your merchants. An agency charges before you know whether the work pays for itself. This is neither.</p>
            </div>
            <dl className="kl-terms">
              <div>
                <dt>Fee</dt>
                <dd>None, now or later.</dd>
              </div>
              <div>
                <dt>Our share</dt>
                <dd>A percentage of the app’s revenue, agreed in writing before any work starts. If the app earns nothing, we earn nothing.</dd>
              </div>
              <div>
                <dt>Ownership</dt>
                <dd>You keep the app, the code, the accounts and the merchants.</dd>
              </div>
              <div>
                <dt>Releases</dt>
                <dd>You approve each one. Nothing ships until you say so.</dd>
              </div>
              <div>
                <dt>Reporting</dt>
                <dd>A monthly statement of what we did and what the app earned.</dd>
              </div>
              <div>
                <dt>Ending</dt>
                <dd>Either side, with 30 days’ notice. You keep all the work.</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="kl-band" aria-labelledby="how">
          <div className="kl-wrap">
            <div className="kl-sec-head">
              <h2 id="how">How it starts</h2>
            </div>
            <ol className="kl-steps">
              <li>
                <h3>Send your App Store link</h3>
                <p>Within one business day you receive a report: which dates affect your app, what merchants are reporting, and what the work involves. It is yours either way.</p>
              </li>
              <li>
                <h3>Agree on a share</h3>
                <p>If you want us to take it on, we propose terms in writing, sized to how much work the app needs.</p>
              </li>
              <li>
                <h3>Give access to the code</h3>
                <p>We work in branches and open pull requests. You, or anyone you trust, review each change before release.</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="kl-band tint" aria-labelledby="who">
          <div className="kl-wrap">
            <h2 id="who" className="kl-sr">
              Who does the work
            </h2>
            <p className="kl-quote">The engineering is done by AI agents. That is what makes a revenue share work for an app too small for an agency to take on.</p>
            <p className="kl-prose" style={{ color: 'var(--ink-2)' }}>
              It is also why you approve every release. The agents write the code and the tests; a person on your side reads each change before it reaches your merchants. Kochito Labs is a small company; a reply to any of our emails reaches us.
            </p>
          </div>
        </section>

        <section className="kl-band" aria-labelledby="questions">
          <div className="kl-wrap">
            <div className="kl-sec-head">
              <h2 id="questions">Questions</h2>
            </div>
            <div className="kl-qa">
              <div>
                <details>
                  <summary>Which apps do you take?</summary>
                  <p>Shopify apps with paying merchants, built by one person or a small team who have moved on to other work. If yours is something else, send it and we will say plainly whether we can help.</p>
                </details>
                <details>
                  <summary>What access do you need?</summary>
                  <p>Read and write access to the code repository, so we can open pull requests. You keep the Partner account and publish releases yourself, or give us a limited staff role. We never ask for a password.</p>
                </details>
                <details>
                  <summary>What if the app earns very little?</summary>
                  <p>Then our share is very little, and that is our risk. The report will say so if we think the app is not worth the work.</p>
                </details>
              </div>
              <div>
                <details>
                  <summary>My app is maintained, but stores are still on script tags.</summary>
                  <p>We can do that part alone: build what is missing, write to each affected merchant with the steps to switch, and track who has moved.</p>
                </details>
                <details>
                  <summary>Do you buy apps?</summary>
                  <p>Not at present. If you would rather sell, say so and we will tell you if that changes.</p>
                </details>
                <details>
                  <summary>Do you work on apps for other platforms?</summary>
                  <p>Shopify first, because its dates are fixed. Ask about others.</p>
                </details>
              </div>
            </div>
          </div>
        </section>

        <section className="kl-band dark">
          <div className="kl-wrap kl-close">
            <h2>Find out which dates affect your app.</h2>
            <LeadForm {...form} anchor={false} />
          </div>
        </section>
      </main>
      <Foot />
    </>
  )
}
