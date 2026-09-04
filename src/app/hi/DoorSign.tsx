import { Gochi_Hand } from 'next/font/google'

// The "Ghosts in the Studies Report" sheet on the door of Study 16 at CASBS
// (photographed 2026-09-03, sheet dated August 2026). Transcribed verbatim,
// including the original's quirks (Presser three times, "Math And Statistics").
const crayon = Gochi_Hand({ subsets: ['latin'], weight: '400' })

const GHOSTS: [string, string, string, string][] = [
  ['1955', 'Bavelas, Alex', 'Psychology', 'Massachusetts Institute of Technology'],
  ['1956', 'Lipset, Seymour Martin', 'Sociology', 'Columbia University'],
  ['1957', 'Schultz, Theodore W.', 'Economics', 'University of Chicago'],
  ['1958', 'Swanson, Guy E.', 'Sociology', 'University of Michigan'],
  ['1959', 'Quine, Willard V.', 'Philosophy', 'Harvard University'],
  ['1961', 'McKeon, Richard P.', 'Philosophy', 'University of Chicago'],
  ['1962', 'Eiseley, Loren', 'Anthropology', 'University of Pennsylvania'],
  ['1962', 'Wilks, Sam', 'Math And Statistics', 'Princeton University'],
  ['1963', 'Messick, Samuel J.', 'Psychology', 'Educational Testing Service'],
  ['1964', 'Linz, Juan J.', 'Sociology', 'Columbia University'],
  ['1965', 'Zwerdling, Alex', 'English And Comparative Literature', 'University of California, Berkeley'],
  ['1966', 'McGuire, William J.', 'Psychology', 'Columbia University'],
  ['1967', 'Hofstadter, Albert', 'Philosophy', 'Columbia University'],
  ['1968', 'Stone, Philip', 'Psychology', 'Harvard University'],
  ['1970', 'Parker, Edwin B.', 'Other', 'Stanford University'],
  ['1971', 'Tversky, Amos', 'Psychology', 'Hebrew University'],
  ['1972', 'Gluckman, Max', 'Anthropology', 'University of Manchester'],
  ['1973', 'Scheffler, Israel', 'Philosophy', 'Harvard University'],
  ['1974', 'Offer, Daniel', 'Psychiatry', 'University of Chicago'],
  ['1975', 'Friedman, Lawrence', 'Law', 'Stanford University'],
  ['1976', 'Pettigrew, Thomas', 'Psychology', 'Harvard University'],
  ['1977', 'Berreman, Gerald D.', 'Anthropology', 'University of California, Berkeley'],
  ['1978', 'Kaplan, John', 'Law', 'Stanford University'],
  ['1979', 'Birren, James E.', 'Psychology', 'University of Southern California'],
  ['1980', 'McCarthy, John', 'Math And Statistics', 'Stanford University'],
  ['1981', 'Gross, Ruth T.', 'Medicine', 'Stanford University'],
  ['1982', 'Peters, Stanley', 'Linguistics', 'University of Texas at Austin'],
  ['1983', 'Clarke-Stewart, K. Alison', 'Education', 'University of Chicago'],
  ['1984', 'Krumhansl, Carol L.', 'Psychology', 'Cornell University'],
  ['1985', 'Sameroff, Arnold J.', 'Psychology', 'University of Illinois'],
  ['1986', 'Goldenberg, Edie N.', 'Political Science', 'University of Michigan'],
  ['1987', 'Presser, Harriet B.', 'Sociology', 'University of Maryland'],
  ['1988', 'McCloskey, James', 'Linguistics', 'University College Dublin'],
  ['1989', 'Painter, Nell Irvin', 'History', 'Princeton University'],
  ['1990', 'Romer, Paul M.', 'Economics', 'University of Chicago'],
  ['1991', 'Box, George E. P.', 'Math And Statistics', 'University of Wisconsin'],
  ['1992', 'Presser, Harriet B.', 'Sociology', 'University of Maryland'],
  ['1993', 'Tannen, Deborah', 'Linguistics', 'Georgetown University'],
  ['1994', 'Hansen, John Mark', 'Political Science', 'University of Chicago'],
  ['1995', 'Andrews, William L.', 'English And Comparative Literature', 'University of Kansas'],
  ['1996', 'Rosenfeld, Rachel A.', 'Sociology', 'University of North Carolina'],
  ['1997', 'Chi, Michelene T. H.', 'Education', 'University of Pittsburgh'],
  ['1998', 'Tiryakian, Edward A.', 'Sociology', 'Duke University'],
  ['1999', 'Mortimer, Jeylan T.', 'Sociology', 'University of Minnesota'],
  ['2000', 'Diaconis, Persi', 'Math And Statistics', 'Stanford University'],
  ['2001', 'Katz, Jack', 'Sociology', 'University of California, Los Angeles'],
  ['2002', 'Walkowitz, Judith', 'History', 'Johns Hopkins University'],
  ['2003', 'Simmons, Beth', 'Political Science', 'University of California, Berkeley'],
  ['2004', 'Presser, Harriet B.', 'Sociology', 'University of Maryland'],
  ['2005', 'Strom, Kaare', 'Political Science', 'University of California, San Diego'],
  ['2006', 'Suny, Ronald G.', 'History', 'University of Chicago'],
  ['2007', 'Hacohen, Malachi', 'History', 'Duke University'],
  ['2008', 'Verma, Suman', 'Psychology', 'Government Home Science College'],
  ['2009', 'Knorr Cetina, Karin', 'Sociology', 'University of Konstanz'],
  ['2010', 'Rowe, John Wallis', 'Medicine', 'Columbia University'],
  ['2011', 'Beachy, Robert', 'History', 'Goucher College'],
  ['2013', 'Jurafsky, Dan', 'Linguistics', 'Stanford University'],
  ['2014', 'Vazire, Simine', 'Psychology', 'Washington University in St. Louis'],
  ['2017', 'Jargowsky, Paul', 'Public Affairs, Public Policy And Urban Studies', 'Rutgers University - Camden'],
  ['2018', 'Gottlieb, Graham', 'Public Affairs, Public Policy And Urban Studies', 'Independent Scholar'],
  ['2021', 'Harrington, Roby', 'Other', 'W.W. Norton and Company'],
  ['2022', 'Beliso-De Jesus, Aisha', 'Anthropology', 'Princeton University'],
  ['2023', 'Matias, Jorge Nathan', 'Communication', 'Cornell University'],
  ['2024', 'Miao, Michelle', 'Criminology And Criminal Justice (interdisciplinary)', 'Chinese University of Hong Kong'],
  ['2026', 'Owolabi, Olukunle', 'Political Science', 'Villanova University'],
]

// The crayon row. Four cells so it lands exactly on the sheet's columns.
const ME: [string, number][] = [
  ['2026', -2.5],
  ['Bart', 1.5],
  ['tinkering', -1.5],
  ['the internet', 2],
]

const CRAYON = '#E9552B'

function CrayonWord({ text, tilt }: { text: string; tilt: number }) {
  // Height is fixed in em so the crayon scales with the sheet; width follows
  // the text (rough per-glyph estimate) so narrow columns never shrink it.
  const w = Math.round(text.length * 15 + 12)
  return (
    <svg
      viewBox={`0 0 ${w} 44`}
      preserveAspectRatio="xMinYMid meet"
      aria-hidden="true"
      style={{
        display: 'block',
        height: '4.3em',
        width: 'auto',
        overflow: 'visible',
        transform: `rotate(${tilt}deg)`,
        transformOrigin: '0 50%',
      }}
    >
      <text
        x="2"
        y="32"
        className={crayon.className}
        fontSize="30"
        fill={CRAYON}
        stroke={CRAYON}
        strokeWidth="1.3"
        strokeLinejoin="round"
        filter="url(#crayon-wax)"
      >
        {text}
      </text>
    </svg>
  )
}

export default function DoorSign() {
  return (
    <div
      style={{
        // Paper on a door: warm white, tiny tilt, soft shadow with a crisp edge.
        background: '#FCFCFA',
        color: '#1F1D1A',
        fontFamily: 'Helvetica, Arial, sans-serif',
        width: '100%',
        maxWidth: '680px',
        padding: '3.2em 2.2em 3em',
        boxSizing: 'border-box',
        boxShadow: '0 1px 0 rgba(0,0,0,0.06), 0 14px 32px rgba(70, 40, 20, 0.18)',
        transform: 'rotate(-0.4deg)',
        fontSize: 'clamp(5px, 1.38vw, 10.6px)',
        lineHeight: 1.45,
      }}
    >
      {/* Crayon wax filter, defined once. Coarse turbulence eats holes in the
          fill (waxy patchiness); fine turbulence roughens the edges. */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <filter id="crayon-wax" x="-10%" y="-20%" width="120%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="7" result="grain" />
            <feColorMatrix
              in="grain"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.9 0.05"
              result="mask"
            />
            <feComposite in="SourceGraphic" in2="mask" operator="in" result="waxed" />
            <feTurbulence type="turbulence" baseFrequency="0.14" numOctaves="2" seed="3" result="warp" />
            <feDisplacementMap in="waxed" in2="warp" scale="1.9" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <div style={{ fontSize: '2.05em', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
        Ghosts in the Studies Report
      </div>
      <div style={{ borderTop: '1px solid #8E8B85', margin: '0.9em 0 1.2em' }} />
      <div style={{ fontSize: '1.2em', fontWeight: 700 }}>Study: 16</div>
      <div style={{ borderTop: '1px solid #8E8B85', margin: '1.2em 0 0.9em' }} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '6.6em 13.5em 14.5em 1fr',
          columnGap: '1.2em',
          rowGap: '0.15em',
        }}
      >
        {['YEAR', 'NAME', 'DISCIPLINE', 'INSTITUTION THEN'].map((h) => (
          <div key={h} style={{ fontWeight: 700, fontSize: '1.2em', letterSpacing: '0.01em', paddingBottom: '0.35em' }}>
            {h}
          </div>
        ))}
        {GHOSTS.map(([y, n, d, i], k) => (
          <div key={k} style={{ display: 'contents' }}>
            <div>{y}</div>
            <div>{n}</div>
            <div>{d}</div>
            <div>{i}</div>
          </div>
        ))}
        {ME.map(([t, tilt], k) => (
          <div key={`me-${k}`} style={{ marginTop: '0.4em', overflow: 'visible' }}>
            <CrayonWord text={t} tilt={tilt} />
          </div>
        ))}
      </div>

      <div style={{ marginTop: '3.4em', fontSize: '0.95em', color: '#5E5B55' }}>August 2026</div>
    </div>
  )
}
