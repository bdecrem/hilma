'use client'

import { LOOKS, type Look } from './looks'

// The "Look" switch at the foot of the board's menu (OLA-170, 2026-11-18): Bart compares the
// looks of looks.css on the real board. It writes the cookie bd_look and reloads; Shell.tsx reads
// the cookie on the server, so a page never flashes in the wrong look. Temporary: once he has
// picked, the pick becomes the default in Shell.tsx and this file goes.
const NAME: Record<Look, string> = { plain: 'Plain', lamp: 'Lamp', desk: 'Desk' }

export default function LookSwitch({ look }: { look: Look }) {
  const pick = (to: Look) => {
    document.cookie = `bd_look=${to}; path=/; max-age=31536000; samesite=lax`
    window.location.reload()
  }
  return (
    <div className="bd-look" role="group" aria-label="Look of the board">
      <span>Look</span>
      <div>
        {LOOKS.map((l) => (
          <button key={l} type="button" aria-pressed={l === look} onClick={() => pick(l)}>
            {NAME[l]}
          </button>
        ))}
      </div>
    </div>
  )
}
