import Link from 'next/link'
import escalation from './escalation-data'

export default function EscalationIndex() {
  const items = [...escalation.history].reverse()

  return (
    <div className="min-h-screen bg-[#0A0908] text-white/80 font-mono">
      <div className="max-w-xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-bold tracking-wider text-[#D4A574] mb-2">ESCALATION</h1>
        <p className="text-xs text-white/30 mb-12">amber makes art. each round gets harder.</p>

        {items.length === 0 && (
          <p className="text-white/20 text-sm">no rounds yet.</p>
        )}

        <div className="space-y-4">
          {items.map((item) => (
            <Link
              key={item.level}
              href={`/amber/escalation/L${item.level}`}
              className="block group"
            >
              <div className="flex items-baseline gap-3">
                <span className="text-[#D4A574] font-bold text-sm">L{item.level}</span>
                <span className="text-white/50 text-sm group-hover:text-white/80 transition-colors">
                  {item.description}
                </span>
              </div>
              <div className="text-[10px] text-white/20 mt-1">{item.date}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
