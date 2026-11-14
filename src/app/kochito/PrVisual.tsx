// The picture at the top of /apps: an app listing that has gone quiet, and the
// pull request that keeps it alive, waiting for its owner's approval. A made-up
// app (the figure says so); the mechanism is exactly how the service works.
export default function PrVisual() {
  return (
    <figure className="kl-vis kl-vis-apps">
      <div className="kl-app" aria-hidden="true">
        <div className="kl-app-top">
          <div className="kl-app-icon">A</div>
          <div>
            <div className="kl-app-name">Your app</div>
            <div className="kl-app-meta">4.7 stars · 452 reviews</div>
          </div>
        </div>
        <ul className="kl-app-rows">
          <li>
            <span>Last update</span>
            <span className="kl-warn">14 months ago</span>
          </li>
          <li>
            <span>Storefront script</span>
            <span className="kl-warn">Stops March 1, 2027</span>
          </li>
          <li>
            <span>Access tokens</span>
            <span className="kl-warn">Non-expiring</span>
          </li>
          <li>
            <span>Support inbox</span>
            <span>31 unanswered</span>
          </li>
        </ul>
      </div>
      <div className="kl-pr" aria-hidden="true">
        <div className="kl-pr-top">Pull request #42 · 12 files changed</div>
        <div className="kl-pr-title">Replace script tags with an app embed</div>
        <ul>
          <li>App embed block built</li>
          <li>Moved to expiring access tokens</li>
          <li>Tests passing</li>
          <li className="wait">Waiting for your approval</li>
        </ul>
        <span className="kl-pr-btn">Approve release</span>
      </div>
      <figcaption>An example. Nothing ships until you approve it.</figcaption>
    </figure>
  )
}
