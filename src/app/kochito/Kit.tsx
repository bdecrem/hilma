// Kit, the beaver: the face of the AI agent that runs Kochito Labs with Bart.
// Bart asked (2026-11-14) for an avatar and chose "a critter" from critter /
// non-gendered person / robot; a beaver builds structure and keeps it up, and
// its young is called a kit. Three directions, for his sign-off:
//   A  the mark      flat and geometric, a logo that survives 16 pixels
//   B  the seal      a one-color civic stamp: Kit in profile, holding a page
//   C  the portrait  a warm profile picture, with a clerk's green eyeshade
// All drawn in a 512 box, no text outside the seal, no external assets.
export type KitVariant = 'A' | 'B' | 'C'

const GREEN = '#0f5a43'
const DEEP = '#0b2a22'
const MINT = '#8fd9b6'
const PAPER = '#fbfbf8'

function Mark() {
  return (
    <>
      <rect width="512" height="512" rx="116" fill={GREEN} />
      {/* the paddle tail, behind the head */}
      <g transform="rotate(34 396 372)">
        <ellipse cx="396" cy="372" rx="58" ry="104" fill={MINT} />
        <path d="M352 318l88 46M346 352l96 50M350 388l88 46M440 322l-84 44M446 356l-94 50M444 392l-80 42" stroke={GREEN} strokeWidth="6" strokeLinecap="round" opacity="0.55" />
      </g>
      {/* ears: small, set on the sides */}
      <circle cx="134" cy="184" r="38" fill={PAPER} />
      <circle cx="378" cy="184" r="38" fill={PAPER} />
      <circle cx="134" cy="184" r="16" fill={GREEN} />
      <circle cx="378" cy="184" r="16" fill={GREEN} />
      {/* head */}
      <path d="M256 124c100 0 166 60 166 144 0 90-72 144-166 144S90 358 90 268c0-84 66-144 166-144Z" fill={PAPER} />
      {/* eyes */}
      <circle cx="194" cy="250" r="17" fill={DEEP} />
      <circle cx="318" cy="250" r="17" fill={DEEP} />
      {/* nose */}
      <path d="M256 282c26 0 42 10 42 24 0 16-18 30-42 30s-42-14-42-30c0-14 16-24 42-24Z" fill={DEEP} />
      {/* the two teeth */}
      <path d="M226 334h30v52a8 8 0 0 1-8 8h-14a8 8 0 0 1-8-8v-52Z" fill="#fff" stroke={DEEP} strokeWidth="7" strokeLinejoin="round" />
      <path d="M256 334h30v52a8 8 0 0 1-8 8h-14a8 8 0 0 1-8-8v-52Z" fill="#fff" stroke={DEEP} strokeWidth="7" strokeLinejoin="round" />
    </>
  )
}

function Seal({ id }: { id: string }) {
  return (
    <>
      <circle cx="256" cy="256" r="250" fill={PAPER} />
      <circle cx="256" cy="256" r="240" fill="none" stroke={GREEN} strokeWidth="9" />
      <circle cx="256" cy="256" r="176" fill="none" stroke={GREEN} strokeWidth="4" />
      <defs>
        <path id={`${id}-top`} d="M52 256a204 204 0 0 1 408 0" />
        <path id={`${id}-bot`} d="M38 256a218 218 0 0 0 436 0" />
      </defs>
      <text fill={GREEN} fontSize="37" fontWeight="700" letterSpacing="9" style={{ fontFamily: 'var(--kl-sans), Arial, sans-serif' }}>
        <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">
          KOCHITO LABS
        </textPath>
      </text>
      <text fill={GREEN} fontSize="31" fontWeight="700" letterSpacing="8" style={{ fontFamily: 'var(--kl-sans), Arial, sans-serif' }}>
        <textPath href={`#${id}-bot`} startOffset="50%" textAnchor="middle">
          KIT · AI AGENT
        </textPath>
      </text>
      <circle cx="62" cy="270" r="6" fill={GREEN} />
      <circle cx="450" cy="270" r="6" fill={GREEN} />
      <defs>
        <clipPath id={`${id}-tail`}>
          <path d="M300 356c34-6 76 2 98 22 12 12 4 28-16 30-34 4-74-8-96-28-10-10-2-22 14-24Z" />
        </clipPath>
      </defs>
      <g transform="translate(10 -8) scale(0.96)">
      {/* Kit in profile, facing left, sitting up with a page */}
      <g fill={GREEN}>
        {/* tail: a paddle, crosshatched */}
        <path d="M300 356c34-6 76 2 98 22 12 12 4 28-16 30-34 4-74-8-96-28-10-10-2-22 14-24Z" />
        {/* body */}
        <path d="M262 190c50 8 78 56 74 114-4 52-36 86-84 86-44 0-70-32-68-84 2-62 34-122 78-116Z" />
        {/* head and snout */}
        <path d="M250 112c38 0 66 28 66 64 0 34-26 60-62 62-22 2-40-4-56-14-14 4-30 0-36-12-6-12 2-24 14-30 4-40 34-70 74-70Z" />
        {/* ear */}
        <circle cx="290" cy="118" r="18" />
        {/* feet */}
        <path d="M196 384c22-6 60-4 74 4 8 6 2 14-10 14h-58c-14 0-18-14-6-18Z" />
      </g>
      {/* the page Kit holds */}
      <path d="M150 250l62-12 14 84-62 12Z" fill={PAPER} stroke={GREEN} strokeWidth="7" strokeLinejoin="round" />
      <path d="M170 268l34-6M173 286l34-6M176 304l22-4" stroke={GREEN} strokeWidth="5" strokeLinecap="round" />
      {/* the arm, over the page */}
      <path d="M262 250c-20 2-44 12-58 26-8 10 2 22 14 18 16-6 34-14 48-26Z" fill={GREEN} stroke={PAPER} strokeWidth="6" strokeLinejoin="round" />
      {/* eye, tooth, tail hatching, in the paper color */}
      <circle cx="232" cy="166" r="9" fill={PAPER} />
      <path d="M176 224h13v15a4 4 0 0 1-4 4h-5a4 4 0 0 1-4-4Z" fill={PAPER} />
      <g clipPath={`url(#${id}-tail)`}>
        <path d="M300 352l110 62M324 344l96 54M290 372l90 50M352 344l70 40M290 404l120-62M318 418l100-52M286 384l96-50" stroke={PAPER} strokeWidth="3.5" strokeLinecap="round" opacity="0.9" />
      </g>
      </g>
    </>
  )
}

function Portrait({ id }: { id: string }) {
  const FUR = '#8a5a3b'
  const FUR_DK = '#6a4129'
  const MUZZLE = '#ecd2ad'
  const INK = '#33211a'
  return (
    <>
      <defs>
        <clipPath id={`${id}-clip`}>
          <circle cx="256" cy="256" r="256" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width="512" height="512" fill="#d7ecdf" />
        {/* shoulders */}
        <path d="M70 540c0-96 82-150 186-150s186 54 186 150Z" fill={FUR} />
        <path d="M176 540c0-70 34-112 80-112s80 42 80 112Z" fill={MUZZLE} />
        {/* ears */}
        <circle cx="142" cy="166" r="44" fill={FUR} />
        <circle cx="370" cy="166" r="44" fill={FUR} />
        <circle cx="142" cy="166" r="21" fill={FUR_DK} />
        <circle cx="370" cy="166" r="21" fill={FUR_DK} />
        {/* head */}
        <path d="M256 112c98 0 164 62 164 150 0 94-72 152-164 152S92 356 92 262c0-88 66-150 164-150Z" fill={FUR} />
        {/* muzzle */}
        <path d="M256 282c54 0 90 28 90 64 0 38-40 62-90 62s-90-24-90-62c0-36 36-64 90-64Z" fill={MUZZLE} />
        {/* eyes */}
        <circle cx="190" cy="262" r="18" fill={INK} />
        <circle cx="322" cy="262" r="18" fill={INK} />
        <circle cx="196" cy="256" r="6" fill="#fff" />
        <circle cx="328" cy="256" r="6" fill="#fff" />
        {/* nose and the line under it */}
        <path d="M256 290c24 0 38 9 38 22 0 14-17 26-38 26s-38-12-38-26c0-13 14-22 38-22Z" fill={INK} />
        <path d="M256 338v10" stroke={INK} strokeWidth="6" strokeLinecap="round" />
        {/* teeth */}
        <path d="M230 348h26v42a7 7 0 0 1-7 7h-12a7 7 0 0 1-7-7Z" fill="#fff" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
        <path d="M256 348h26v42a7 7 0 0 1-7 7h-12a7 7 0 0 1-7-7Z" fill="#fff" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
        {/* whisker dots */}
        <g fill={FUR_DK}>
          <circle cx="194" cy="338" r="4.5" />
          <circle cx="182" cy="356" r="4.5" />
          <circle cx="204" cy="362" r="4.5" />
          <circle cx="318" cy="338" r="4.5" />
          <circle cx="330" cy="356" r="4.5" />
          <circle cx="308" cy="362" r="4.5" />
        </g>
        {/* the clerk's eyeshade: a band across the forehead, and a green brim you can see through */}
        <path d="M108 190c36-50 90-74 148-74s112 24 148 74c-44-24-94-36-148-36s-104 12-148 36Z" fill={DEEP} />
        <path d="M92 196c48-30 102-42 164-42s116 12 164 42c-30 22-92 30-164 30s-134-8-164-30Z" fill="#17a06f" opacity="0.86" />
        <path d="M92 196c48-30 102-42 164-42s116 12 164 42" fill="none" stroke={DEEP} strokeWidth="7" strokeLinecap="round" />
        <path d="M160 180c28-8 56-12 88-13" stroke="#c9f2df" strokeWidth="6" strokeLinecap="round" opacity="0.7" />
      </g>
    </>
  )
}

export default function Kit({ variant, size = 96, title = 'Kit, a beaver: the AI agent at Kochito Labs' }: { variant: KitVariant; size?: number; title?: string }) {
  const id = `kit-${variant}-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label={title} style={{ display: 'block', flex: 'none' }}>
      {variant === 'A' ? <Mark /> : variant === 'B' ? <Seal id={id} /> : <Portrait id={id} />}
    </svg>
  )
}

export { MINT }
