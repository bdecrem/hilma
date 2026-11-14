'use client'

import { useState } from 'react'

// The picture at the top of /pdf: a council agenda, and what a screen reader
// says about it, as posted and after fixing. The agenda is a made-up one (the
// figure says so); the mechanism is exactly what the service does. The switch
// is the point: the page looks the same in both states.
const ITEMS: [string, string, string][] = [
  ['26-114', 'Street resurfacing, Phase 2', '$184,000'],
  ['26-115', 'Library roof repair', '$62,500'],
  ['26-116', 'Water meter replacement', '$318,200'],
]

export default function DocVisual() {
  const [state, setState] = useState<'posted' | 'fixed'>('fixed')
  return (
    <figure className="kl-vis" data-state={state}>
      <div className="kl-vis-tabs" role="group" aria-label="Show the document">
        <button type="button" aria-pressed={state === 'posted'} onClick={() => setState('posted')}>
          As posted
        </button>
        <button type="button" aria-pressed={state === 'fixed'} onClick={() => setState('fixed')}>
          Fixed
        </button>
      </div>

      <div className="kl-page" aria-hidden="true">
        <div className="kl-doc-head">
          <div className="kl-blk" style={{ marginBottom: 0 }}>
            <span className="kl-tagchip">Figure</span>
            <div className="kl-seal">★</div>
          </div>
          <div className="kl-blk" style={{ marginBottom: 0, flex: 1 }}>
            <span className="kl-tagchip" style={{ left: 'auto', right: 0, transform: 'translateY(-130%)' }}>
              H1
            </span>
            <div className="kl-doc-org">City Council</div>
            <div className="kl-doc-title">Regular Meeting Agenda</div>
          </div>
        </div>
        <p className="kl-doc-meta">Tuesday, June 9 · 6:00 PM · Council Chambers</p>
        <div className="kl-doc-rule" />
        <div className="kl-blk">
          <span className="kl-tagchip">H2</span>
          <div className="kl-doc-h">1. Call to order</div>
        </div>
        <div className="kl-blk">
          <span className="kl-tagchip">H2</span>
          <div className="kl-doc-h">2. Consent agenda</div>
        </div>
        <div className="kl-blk">
          <span className="kl-tagchip">Table</span>
          <table className="kl-doc-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {ITEMS.map(([n, d, a]) => (
                <tr key={n}>
                  <td>
                    <span className="kl-doc-link">{n}</span>
                  </td>
                  <td>{d}</td>
                  <td>{a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="kl-blk">
          <span className="kl-tagchip">H2</span>
          <div className="kl-doc-h">3. Public hearing</div>
        </div>
        <div className="kl-blk kl-greek">
          <span className="kl-tagchip">P</span>
          <i />
          <i />
          <i />
        </div>
        <div className="kl-blk">
          <span className="kl-tagchip">H2</span>
          <div className="kl-doc-h">4. Reports from staff</div>
        </div>
        <div className="kl-blk kl-greek">
          <span className="kl-tagchip">P</span>
          <i />
          <i />
          <i />
        </div>
        <div className="kl-blk">
          <span className="kl-tagchip">H2</span>
          <div className="kl-doc-h">5. Adjournment</div>
        </div>
        <div className="kl-blk kl-greek" style={{ marginBottom: 0 }}>
          <span className="kl-tagchip">P</span>
          <i />
          <i />
        </div>
      </div>

      <div className="kl-reader">
        <div className="kl-reader-top">
          <span>What a screen reader announces</span>
          <span className="kl-wave" aria-hidden="true">
            {[6, 12, 8, 14, 5, 10, 7].map((h, i) => (
              <i key={i} style={{ height: h }} />
            ))}
          </span>
        </div>
        {state === 'fixed' ? (
          <ol>
            <li>
              <b>H1</b>
              <span>City Council Regular Meeting Agenda</span>
            </li>
            <li>
              <b>IMAGE</b>
              <span>Seal of the city</span>
            </li>
            <li>
              <b>H2</b>
              <span>Consent agenda</span>
            </li>
            <li>
              <b>TABLE</b>
              <span>3 columns: Item, Description, Amount</span>
            </li>
            <li>
              <b>LINK</b>
              <span>Staff report 26-114</span>
            </li>
          </ol>
        ) : (
          <p className="kl-reader-flat">
            <em>Untitled document.</em> city council regular meeting agenda tuesday june 9 6 00 pm council chambers 1 call to order 2 consent agenda item description amount 26 114 street resurfacing phase 2 184 000 26 115…
          </p>
        )}
      </div>
      <figcaption>An example agenda. The page looks the same in both states; what changes is underneath.</figcaption>
    </figure>
  )
}
