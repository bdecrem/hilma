// Line icons drawn inline (no icon font, no request). 20 px box, 1.6 px stroke, currentColor.
import type { JSX } from 'solid-js'

// Functions, not elements: a Solid element is one DOM node and can only be placed once.
const PATHS: Record<string, () => JSX.Element> = {
  dashboard: () => (
    <>
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <path d="M3 7.5h14" />
    </>
  ),
  document: () => (
    <>
      <path d="M5.5 2.75h6.5l3 3v11.5h-9.5z" />
      <path d="M8 9h5M8 12h5M8 15h3" />
    </>
  ),
  chart: () => <path d="M3.5 3.5v13h13M7 13.5V10M10 13.5V7M13 13.5V9.5" />,
  image: () => (
    <>
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <path d="m3.5 14 4-4 3 3 2-2 4 4" />
      <circle cx="13" cy="7.75" r="1.25" />
    </>
  ),
  filedoc: () => (
    <>
      <path d="M5.5 2.75h6.5l3 3v11.5h-9.5z" />
      <path d="M12 2.75v3h3M8 10h5M8 13h5" />
    </>
  ),
  table: () => (
    <>
      <rect x="3" y="4" width="14" height="12" rx="1" />
      <path d="M3 8h14M3 12h14M8 4v12" />
    </>
  ),
  site: () => (
    <>
      <rect x="2.75" y="4" width="14.5" height="12" rx="1.5" />
      <path d="M2.75 7.5h14.5M5 5.75h.01M7 5.75h.01" />
    </>
  ),
  eye: () => (
    <>
      <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" />
      <circle cx="10" cy="10" r="2.5" />
    </>
  ),
  plus: () => <path d="M10 4v12M4 10h12" />,
  up: () => <path d="M10 16V4M5 9l5-5 5 5" />,
  down: () => <path d="M10 3v10M5.5 8.5 10 13l4.5-4.5M4 17h12" />,
  close: () => <path d="M5 5l10 10M15 5 5 15" />,
  back: () => <path d="M12.5 4.5 7 10l5.5 5.5" />,
  look: () => (
    <>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="m12.5 12.5 4.5 4.5" />
    </>
  ),
  search: () => (
    <>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="m12.5 12.5 4.5 4.5" />
    </>
  ),
  read: () => <path d="M2.5 4.5c2.5-1 5-1 7.5.75 2.5-1.75 5-1.75 7.5-.75v11c-2.5-1-5-1-7.5.75-2.5-1.75-5-1.75-7.5-.75zM10 5.25v11" />,
  write: () => <path d="M13.5 3.5l3 3-9 9H4.5v-3zM11.5 5.5l3 3" />,
  change: () => <path d="M13.5 3.5l3 3-9 9H4.5v-3zM11.5 5.5l3 3" />,
  run: () => <path d="M6 4.5v11l9-5.5z" />,
  check: () => <path d="M4 10.5l4 4 8-9" />,
  think: () => (
    <>
      <path d="M5 5h10M5 10h10M5 15h6" />
    </>
  ),
  other: () => <circle cx="10" cy="10" r="2" />,
  stop: () => <rect x="5.5" y="5.5" width="9" height="9" rx="1" />,
  settings: () => (
    <>
      <path d="M3.5 6.5h13M3.5 13.5h13" />
      <circle cx="7.5" cy="6.5" r="2" />
      <circle cx="12.5" cy="13.5" r="2" />
    </>
  ),
  file: () => <path d="M5.5 2.75h6.5l3 3v11.5h-9.5zM12 2.75v3h3" />,
  machine: () => (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 3.5a6.5 6.5 0 0 0 0 13" />
    </>
  ),
}

export function Icon(props: { name: string; size?: number; class?: string }) {
  return (
    <svg
      class={props.class}
      width={props.size ?? 20}
      height={props.size ?? 20}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {(PATHS[props.name] ?? PATHS.other)()}
    </svg>
  )
}

/** The wordmark: Ola with the vermilion comma, as on ola.cx. */
export function Wordmark() {
  return (
    <span class="wordmark" aria-label="Ola">
      <span aria-hidden="true">Ola</span>
      <span class="wordmark-comma" aria-hidden="true">,</span>
    </span>
  )
}
