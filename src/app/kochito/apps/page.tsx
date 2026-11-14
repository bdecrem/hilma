import type { Metadata } from 'next'
import LeadForm from '../LeadForm'
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

export default function AppMaintenance() {
  return (
    <>
      <Track page="apps" />
      <Top current="apps" />
      <main id="main">
        <div className="kl-wrap kl-hero">
          <div>
            <h1>{TITLE}</h1>
            <p className="kl-lede">Your app still has paying merchants, and you no longer have time for it. We take over the 2027 platform migrations, the bug fixes and the support inbox. You keep the app.</p>
            <ul className="kl-points">
              <li>
                <strong>No fee.</strong> We are paid an agreed share of what the app earns.
              </li>
              <li>
                <strong>You stay the owner</strong> of the app, the code, the accounts and the merchants.
              </li>
              <li>
                <strong>You approve every release.</strong> Each change is a pull request you can read.
              </li>
            </ul>
          </div>
          <LeadForm
            page="apps"
            heading="Get a free report on your app"
            intro="Which of Shopify’s dates affect it, and what the work involves."
            emailPlaceholder="name@yourcompany.com"
            detailLabel="Your app’s Shopify App Store link"
            detailPlaceholder="https://apps.shopify.com/"
            detailHint="Or leave this empty if you would rather talk first."
            button="Request the report"
            done="Your report will arrive within one business day."
          />
        </div>

        <section className="kl-band" aria-labelledby="dates">
          <div className="kl-wrap kl-split">
            <div>
              <h2 id="dates">Shopify’s 2027 dates</h2>
              <p>Two platform changes take effect in early 2027. An app that nobody is maintaining will miss both.</p>
              <p className="kl-note">
                Sources: Shopify’s developer changelog, <a href="https://shopify.dev/changelog/online-store-script-tags-deprecation">script tags</a> (August 24, 2026) and <a href="https://shopify.dev/changelog/posts/expiring-offline-access-tokens-required-for-all-public-apps-as-of-january-1-2027">expiring access tokens</a> (May 20, 2026). Shopify has said it will review the March date in January.
              </p>
            </div>
            <table className="kl-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">What changes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="date">October 1, 2026</td>
                  <td>In effect now. Apps can no longer create or update script tags, so a new install of an app that depends on them gets no storefront script.</td>
                </tr>
                <tr>
                  <td className="date">January 1, 2027</td>
                  <td>Public apps still using non-expiring offline access tokens are delisted from the App Store and blocked from new installs.</td>
                </tr>
                <tr>
                  <td className="date">March 1, 2027</td>
                  <td>Shopify stops running script tags on storefronts. The replacement is an app embed, which each merchant has to switch on.</td>
                </tr>
                <tr>
                  <td className="date">April 1, 2027</td>
                  <td>Admin API requests made with non-expiring tokens are refused.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="kl-band alt" aria-labelledby="work">
          <div className="kl-wrap kl-split">
            <h2 id="work">What we take on</h2>
            <dl className="kl-rows">
              <div>
                <dt>The 2027 migrations</dt>
                <dd>Building the app embed that replaces your script tags, moving to expiring access tokens, and helping each merchant switch the embed on.</dd>
              </div>
              <div>
                <dt>Bug fixes</dt>
                <dd>Starting with what your recent reviews say is broken.</dd>
              </div>
              <div>
                <dt>Merchant support</dt>
                <dd>Your support address forwards to us. Merchants get an answer within one business day.</dd>
              </div>
              <div>
                <dt>Platform upkeep</dt>
                <dd>API version updates and App Store requirements as Shopify announces them.</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="kl-band" aria-labelledby="terms">
          <div className="kl-wrap kl-split">
            <div>
              <h2 id="terms">Terms</h2>
              <p>An app that still earns is worth more maintained than abandoned. Selling it means finding a buyer and handing over your merchants. An agency charges before you know whether the work pays for itself. This is neither.</p>
            </div>
            <dl className="kl-rows">
              <div>
                <dt>Fee</dt>
                <dd>None, now or later.</dd>
              </div>
              <div>
                <dt>Our share</dt>
                <dd>A percentage of the app’s revenue, proposed in writing before any work starts and sized to how much work the app needs. If the app earns nothing, we earn nothing.</dd>
              </div>
              <div>
                <dt>Ownership</dt>
                <dd>You keep the app, the code, the developer accounts and the merchant relationships.</dd>
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
                <dd>Either side can end the arrangement with 30 days’ notice. You keep all the work.</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="kl-band alt" aria-labelledby="how">
          <div className="kl-wrap kl-split">
            <h2 id="how">How it starts</h2>
            <ol className="kl-steps kl-prose">
              <li>
                <strong>Send your App Store link.</strong> Within one business day you receive a report: which dates affect your app, what merchants are reporting, and what the work involves. The report is yours whether or not we work together.
              </li>
              <li>
                <strong>Agree on a share.</strong> If you want us to take it on, we propose terms in writing.
              </li>
              <li>
                <strong>Give access to the code.</strong> We work in branches and open pull requests. You, or anyone you trust, review each change before release.
              </li>
            </ol>
          </div>
        </section>

        <section className="kl-band" aria-labelledby="who">
          <div className="kl-wrap kl-split">
            <h2 id="who">Who does the work</h2>
            <div className="kl-prose">
              <p>Kochito Labs is a small company, and the engineering is done by AI agents. That is what makes a revenue share workable for an app too small for an agency to take on.</p>
              <p>It is also why you approve every release. The agents write the code and the tests; a person on your side reads each change before it reaches your merchants.</p>
            </div>
          </div>
        </section>

        <section className="kl-band alt" aria-labelledby="questions">
          <div className="kl-wrap">
            <h2 id="questions">Questions</h2>
            <div className="kl-qa">
              <div>
                <h3>Which apps do you take?</h3>
                <p>Shopify apps with paying merchants, built by one person or a small team who have moved on to other work. If yours is something else, send it and we will say plainly whether we can help.</p>
              </div>
              <div>
                <h3>What access do you need?</h3>
                <p>Read and write access to the code repository, so we can open pull requests. You keep the Partner account and publish releases yourself, or give us a limited staff role. We never ask for a password.</p>
              </div>
              <div>
                <h3>What if the app earns very little?</h3>
                <p>Then our share is very little, and that is our risk. The report will say so if we think the app is not worth the work.</p>
              </div>
              <div>
                <h3>My app is maintained, but stores are still on script tags.</h3>
                <p>We can do that part alone: build what is missing, write to each affected merchant with the steps to switch, and track who has moved.</p>
              </div>
              <div>
                <h3>Do you buy apps?</h3>
                <p>Not at present. If you would rather sell, say so and we will tell you if that changes.</p>
              </div>
              <div>
                <h3>Do you work on apps for other platforms?</h3>
                <p>Shopify first, because its dates are fixed. Ask about others.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="kl-band">
          <div className="kl-wrap kl-close">
            <h2>Find out which dates affect your app.</h2>
            <a className="kl-btn" href="#start">
              Request the report
            </a>
          </div>
        </section>
      </main>
      <Foot />
    </>
  )
}
