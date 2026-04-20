// SparkIcon.jsx — authoritative React reference for the "Little Spark" icon.
// Extracted from the design prototype.
//
// Usage: <SparkIcon size={1024} />
// Size-responsive detail: the face (eyes + smile) only renders at size >= 60.

export function SparkIcon({ size = 180 }) {
  const eye = size * 0.025;
  return (
    <svg width={size} height={size} viewBox="0 0 180 180" style={{ display: 'block' }}>
      <defs>
        <radialGradient id={`spark-bg-${size}`} cx="30%" cy="25%" r="95%">
          <stop offset="0%" stopColor="#FFD580" />
          <stop offset="45%" stopColor="#FF9A5A" />
          <stop offset="100%" stopColor="#B5347B" />
        </radialGradient>
        <radialGradient id={`spark-glow-${size}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFF2D6" stopOpacity="0.9" />
          <stop offset="70%" stopColor="#FFF2D6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`spark-core-${size}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFAF0" />
          <stop offset="100%" stopColor="#FFD8A0" />
        </linearGradient>
      </defs>

      <rect width="180" height="180" fill={`url(#spark-bg-${size})`} />

      <ellipse cx="90" cy="90" rx="68" ry="26" fill="none"
        stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"
        transform="rotate(-20 90 90)" />
      <ellipse cx="90" cy="90" rx="58" ry="18" fill="none"
        stroke="rgba(255,255,255,0.35)" strokeWidth="1.5"
        transform="rotate(25 90 90)" />

      <circle cx="28" cy="72" r="4" fill="#FFF2D6" />
      <circle cx="152" cy="104" r="3" fill="#FFF2D6" opacity="0.8" />
      <circle cx="140" cy="58" r="2.5" fill="#FFF2D6" opacity="0.6" />
      <circle cx="48" cy="130" r="3" fill="#FFF2D6" opacity="0.7" />

      <circle cx="90" cy="90" r="52" fill={`url(#spark-glow-${size})`} />

      <path
        d="M90 58 C93 74, 97 80, 114 84 C97 88, 93 94, 90 110 C87 94, 83 88, 66 84 C83 80, 87 74, 90 58 Z"
        fill={`url(#spark-core-${size})`}
        stroke="#B5347B" strokeWidth="1.2" strokeLinejoin="round"
      />

      {size >= 60 && (
        <g>
          <circle cx="85" cy="86" r={eye} fill="#3A1A2A" />
          <circle cx="95" cy="86" r={eye} fill="#3A1A2A" />
          <circle cx={85 + eye * 0.3} cy={86 - eye * 0.3} r={eye * 0.3} fill="#fff" />
          <circle cx={95 + eye * 0.3} cy={86 - eye * 0.3} r={eye * 0.3} fill="#fff" />
          <path
            d={`M87 ${92 + size * 0.005} Q90 ${95 + size * 0.01} 93 ${92 + size * 0.005}`}
            stroke="#3A1A2A" strokeWidth={size * 0.008}
            fill="none" strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );
}
