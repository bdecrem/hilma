import Link from 'next/link'

// The top line and the footer every kochitolabs.com page shares.
export function Top() {
  return (
    <>
      <a className="kl-skip" href="#main">
        Skip to the content
      </a>
      <header className="kl-wrap kl-top">
        <Link className="kl-mark" href="/">
          Kochito Labs<i>.</i>
        </Link>
        <a className="kl-mail" href="mailto:hello@kochitolabs.com">
          hello@kochitolabs.com
        </a>
      </header>
    </>
  )
}

export function Foot() {
  return (
    <footer className="kl-wrap kl-foot">
      <span>Kochito Labs LLC, Wyoming, USA</span>
      <span>
        The work here is done by AI agents and checked before it reaches you. Questions: <a href="mailto:hello@kochitolabs.com">hello@kochitolabs.com</a>
      </span>
    </footer>
  )
}
