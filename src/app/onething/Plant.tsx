// The seven levels as one growing plant: Seed, Sprout, Sapling, Tree, Grove,
// Forest, Old Growth. Candy style, like the payoff garden (grow-scene.ts):
// glossy greens under an ink outline, a brown trunk, a grass mound, and from
// Grove up a few blossoms in the page's colours.

/** A trunk or stem: ink underneath, brown on top. */
function Stem({ d }: { d: string }) {
  return <><path d={d} className="p-trunk-ink" /><path d={d} className="p-trunk" /></>;
}

function Blooms({ at }: { at: [number, number, string][] }) {
  return <>{at.map(([x, y, c], i) => <circle key={i} cx={x} cy={y} r="2.6" fill={c} className="p-bloom" />)}</>;
}

type TreeProps = { x: number; w: number; top: number; light?: boolean };

function Tree({ x, w, top, light }: TreeProps) {
  // trunk from the ground (y=84) up into a round canopy whose bottom sits at top+w*0.9
  const r = w / 2;
  const cy = top + r;
  const trunkTop = cy + r * 0.55;
  return (
    <g>
      <Stem d={`M${x} 84 L${x} ${trunkTop}`} />
      <path
        d={`M${x} ${top} C${x + r * 0.95} ${top} ${x + r} ${cy - r * 0.3} ${x + r} ${cy} C${x + r} ${cy + r * 0.75} ${x + r * 0.6} ${cy + r * 0.9} ${x} ${cy + r * 0.9} C${x - r * 0.6} ${cy + r * 0.9} ${x - r} ${cy + r * 0.75} ${x - r} ${cy} C${x - r} ${cy - r * 0.3} ${x - r * 0.95} ${top} ${x} ${top} Z`}
        className={light ? 'p-leaf-light' : 'p-leaf'}
      />
      <ellipse cx={x - r * 0.38} cy={cy - r * 0.42} rx={r * 0.22} ry={r * 0.14} transform={`rotate(-30 ${x - r * 0.38} ${cy - r * 0.42})`} className="p-shine" />
    </g>
  );
}

function Leaf({ x, y, side, s = 1, light }: { x: number; y: number; side: -1 | 1; s?: number; light?: boolean }) {
  const dx = side * 16 * s;
  return (
    <path
      d={`M${x} ${y} C${x + dx * 0.55} ${y} ${x + dx} ${y - 8 * s} ${x + dx} ${y - 14 * s} C${x + dx * 0.45} ${y - 14 * s} ${x} ${y - 8 * s} ${x} ${y} Z`}
      className={light ? 'p-leaf-light' : 'p-leaf'}
    />
  );
}

export default function Plant({ level, size = 120, className }: { level: number; size?: number; className?: string }) {
  const l = Math.max(0, Math.min(6, level));
  return (
    <svg
      className={`ot-plant${className ? ` ${className}` : ''}`}
      width={size}
      height={size * (100 / 120)}
      viewBox="0 0 120 100"
      role="img"
      aria-label={['Seed', 'Sprout', 'Sapling', 'Tree', 'Grove', 'Forest', 'Old Growth'][l]}
    >
      <path d="M6 88 Q60 76 114 88 L114 100 L6 100 Z" className="p-hill" />
      {l === 0 && (
        <g>
          <Stem d="M61 76 C61 70 64 66 68 65" />
          <ellipse cx="60" cy="80" rx="7" ry="4.6" className="p-seed" />
        </g>
      )}
      {l === 1 && (
        <g>
          <Stem d="M60 84 C60 74 60 66 60 58" />
          <Leaf x={60} y={68} side={-1} />
          <Leaf x={60} y={62} side={1} light />
        </g>
      )}
      {l === 2 && (
        <g>
          <Stem d="M60 84 C60 70 60 52 60 34" />
          <Leaf x={60} y={74} side={-1} s={1.1} />
          <Leaf x={60} y={64} side={1} s={1.05} light />
          <Leaf x={60} y={54} side={-1} s={0.9} light />
          <Leaf x={60} y={44} side={1} s={0.8} />
        </g>
      )}
      {l === 3 && <Tree x={60} w={56} top={20} />}
      {l === 4 && (
        <g>
          <Tree x={30} w={34} top={44} light />
          <Tree x={60} w={52} top={24} />
          <Tree x={91} w={36} top={42} light />
          <Blooms at={[[52, 34, '#ff5fa8'], [70, 44, '#ffd23f']]} />
        </g>
      )}
      {l === 5 && (
        <g>
          <Tree x={18} w={26} top={52} light />
          <Tree x={38} w={38} top={36} />
          <Tree x={60} w={46} top={26} />
          <Tree x={82} w={36} top={38} light />
          <Tree x={102} w={26} top={50} />
          <Blooms at={[[56, 36, '#ff5fa8'], [34, 50, '#ffd23f'], [86, 48, '#33b6ff']]} />
        </g>
      )}
      {l === 6 && (
        <g>
          <Stem d="M53 84 C54 66 54 52 55 44 M67 84 C66 66 66 52 65 44" />
          <Stem d="M55 44 C52 44 48 40 47 36 M65 44 C68 44 72 40 73 36" />
          <path d="M60 10 C86 10 106 26 106 46 C106 62 90 70 60 70 C30 70 14 62 14 46 C14 26 34 10 60 10 Z" className="p-leaf" />
          <path d="M60 18 C78 18 92 30 92 44 C92 54 82 60 60 60 C50 60 40 56 34 48 C36 32 46 18 60 18 Z" className="p-leaf-light" />
          <ellipse cx="42" cy="26" rx="8" ry="4" transform="rotate(-25 42 26)" className="p-shine" />
          <Blooms at={[[40, 40, '#ff5fa8'], [70, 28, '#ffd23f'], [84, 50, '#33b6ff'], [28, 54, '#ff7a2f'], [58, 52, '#a98bff']]} />
        </g>
      )}
    </svg>
  );
}
