// The seven levels as one growing plant: Seed, Sprout, Sapling, Tree, Grove,
// Forest, Old Growth. Hand-drawn strokes, two greens, one ground line.

type TreeProps = { x: number; w: number; top: number; light?: boolean };

function Tree({ x, w, top, light }: TreeProps) {
  // trunk from the ground (y=84) up into a round canopy whose bottom sits at top+w*0.9
  const r = w / 2;
  const cy = top + r;
  const trunkTop = cy + r * 0.55;
  return (
    <g>
      <path d={`M${x} 84 L${x} ${trunkTop}`} className="p-trunk" />
      <path
        d={`M${x} ${top} C${x + r * 0.95} ${top} ${x + r} ${cy - r * 0.3} ${x + r} ${cy} C${x + r} ${cy + r * 0.75} ${x + r * 0.6} ${cy + r * 0.9} ${x} ${cy + r * 0.9} C${x - r * 0.6} ${cy + r * 0.9} ${x - r} ${cy + r * 0.75} ${x - r} ${cy} C${x - r} ${cy - r * 0.3} ${x - r * 0.95} ${top} ${x} ${top} Z`}
        className={light ? 'p-leaf-light' : 'p-leaf'}
      />
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
      <path d="M14 84 H106" className="p-ground" />
      {l === 0 && (
        <g>
          <path d="M40 84 C46 74 74 74 80 84" className="p-soil" />
          <ellipse cx="60" cy="79" rx="5" ry="3.4" className="p-seed" />
          <path d="M60 71 C60 66 63 63 66 62" className="p-trunk" />
        </g>
      )}
      {l === 1 && (
        <g>
          <path d="M60 84 C60 74 60 66 60 58" className="p-trunk" />
          <Leaf x={60} y={68} side={-1} />
          <Leaf x={60} y={62} side={1} light />
        </g>
      )}
      {l === 2 && (
        <g>
          <path d="M60 84 C60 70 60 52 60 34" className="p-trunk" />
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
        </g>
      )}
      {l === 5 && (
        <g>
          <Tree x={18} w={26} top={52} light />
          <Tree x={38} w={38} top={36} />
          <Tree x={60} w={46} top={26} />
          <Tree x={82} w={36} top={38} light />
          <Tree x={102} w={26} top={50} />
        </g>
      )}
      {l === 6 && (
        <g>
          <path d="M53 84 C54 66 54 52 55 44 M67 84 C66 66 66 52 65 44" className="p-trunk" />
          <path d="M55 44 C52 44 48 40 47 36 M65 44 C68 44 72 40 73 36" className="p-trunk" />
          <path d="M60 10 C86 10 106 26 106 46 C106 62 90 70 60 70 C30 70 14 62 14 46 C14 26 34 10 60 10 Z" className="p-leaf" />
          <path d="M60 18 C78 18 92 30 92 44 C92 54 82 60 60 60 C50 60 40 56 34 48 C36 32 46 18 60 18 Z" className="p-leaf-light" />
          <circle cx="42" cy="40" r="2.2" className="p-seed" />
          <circle cx="70" cy="30" r="2.2" className="p-seed" />
          <circle cx="82" cy="50" r="2.2" className="p-seed" />
        </g>
      )}
    </svg>
  );
}
