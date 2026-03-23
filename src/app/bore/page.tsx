'use client'

import { useState, useEffect } from 'react'

const INSTALL_CMD = 'curl -sSf https://bore.cx/install | sh'

const TERMINAL_LINES = [
  { text: `$ ${INSTALL_CMD}`, delay: 0, color: '#FFF8E7' },
  { text: 'bore: installing darwin/arm64...', delay: 600, color: '#666' },
  { text: 'bore: installed to ~/.bore/bin/bore', delay: 1200, color: '#B4E33D' },
  { text: '', delay: 1600, color: '' },
  { text: '$ bore http 3000', delay: 2200, color: '#FFF8E7' },
  { text: '', delay: 2600, color: '' },
  { text: '  bore tunnel ready', delay: 3000, color: '#B4E33D' },
  { text: '  forwarding  https://a7f3c912.bore.cx \u2192 localhost:3000', delay: 3400, color: '#FC913A' },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      className="shrink-0 p-2 rounded-md hover:bg-white/10 transition-colors group"
      title="Copy to clipboard"
    >
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B4E33D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/30 group-hover:text-white/60 transition-colors">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  )
}

export default function BoreLanding() {
  const [visibleLines, setVisibleLines] = useState(0)

  useEffect(() => {
    const timers = TERMINAL_LINES.map((line, i) =>
      setTimeout(() => setVisibleLines(i + 1), line.delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #1a1a18 0%, #2a2218 100%)' }}>
      {/* Nav */}
      <nav className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-white tracking-tight">bore</span>
          <span className="text-xs text-white/20 font-mono">tunnel</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="https://github.com/bdecrem/hilma" target="_blank" rel="noopener noreferrer" className="text-sm text-white/40 hover:text-white/70 transition-colors">GitHub</a>
          <a href="/bore/docs" className="text-sm text-white/40 hover:text-white/70 transition-colors">Docs</a>
          <a href="/bore/login" className="text-sm text-white/40 hover:text-white/70 transition-colors">Login</a>
          <a href="/bore/signup" className="text-sm px-4 py-1.5 rounded-full bg-gradient-to-r from-[#FC913A] to-[#FF4E50] text-white font-medium hover:opacity-90 transition-opacity">Get Started</a>
        </div>
      </nav>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-6 pt-20 pb-16">
        <h1 className="text-5xl sm:text-6xl font-bold text-white tracking-tight leading-tight">
          Expose localhost<br />
          to the internet.
        </h1>
        <p className="mt-4 text-lg text-white/40 max-w-xl">
          One command. No config. Built for AI agents that need to reach your machine from anywhere.
        </p>

        {/* Terminal */}
        <div className="mt-10 rounded-xl overflow-hidden border border-white/10 max-w-2xl">
          {/* Title bar */}
          <div className="bg-white/5 px-4 py-2.5 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#FF4E50]/60" />
            <span className="w-3 h-3 rounded-full bg-[#F9D423]/60" />
            <span className="w-3 h-3 rounded-full bg-[#B4E33D]/60" />
            <span className="text-xs text-white/20 font-mono ml-2">terminal</span>
          </div>
          {/* Content */}
          <div className="bg-[#0a0a08] p-6 font-mono text-sm leading-relaxed min-h-[180px]">
            {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => (
              <div key={i} style={{ color: line.color || 'transparent' }}>
                {line.text || '\u00A0'}
              </div>
            ))}
            <span className="inline-block w-2 h-4 bg-white/50 animate-pulse" />
          </div>
        </div>

        {/* Install */}
        <div className="mt-8 flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg pl-4 pr-1.5 py-1.5">
            <code className="text-sm font-mono text-white/70">
              {INSTALL_CMD}
            </code>
            <CopyButton text={INSTALL_CMD} />
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-6 py-16 grid grid-cols-1 sm:grid-cols-3 gap-8">
        <Feature
          title="Agent-first"
          desc="JSON output mode, meaningful exit codes, env var config. Zero interactive prompts. Built for AI agents to use programmatically."
          color="#FC913A"
        />
        <Feature
          title="One command"
          desc="bore http 3000. That's it. Works through firewalls, NAT, hotel wifi, corporate VPNs. Outbound WebSocket — nothing to configure."
          color="#B4E33D"
        />
        <Feature
          title="SSH access"
          desc="bore ssh gives your home machine a public hostname. SSH in from anywhere. No port forwarding, no dynamic DNS, no hassle."
          color="#FF4E50"
        />
      </div>

      {/* Pricing */}
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-white mb-8">Pricing</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
          <div className="rounded-xl border border-white/10 p-6 bg-white/5">
            <h3 className="text-lg font-semibold text-white mb-1">Free Trial</h3>
            <p className="text-3xl font-bold text-white mb-2">$0 <span className="text-sm font-normal text-white/30">/ 90 days</span></p>
            <ul className="text-sm text-white/40 space-y-1.5 mt-4">
              <li>Random subdomains</li>
              <li>HTTP tunnels</li>
              <li>No credit card</li>
            </ul>
          </div>
          <div className="rounded-xl border border-[#FC913A]/30 p-6 bg-[#FC913A]/5">
            <h3 className="text-lg font-semibold text-white mb-1">Pro</h3>
            <p className="text-3xl font-bold text-white mb-2">$5 <span className="text-sm font-normal text-white/30">/ month</span></p>
            <ul className="text-sm text-white/40 space-y-1.5 mt-4">
              <li>Custom subdomains</li>
              <li>SSH tunnels</li>
              <li>Priority support</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-5xl mx-auto px-6 py-12 border-t border-white/5 flex items-center justify-between">
        <span className="text-xs text-white/20 font-mono">bore.cx</span>
        <div className="flex gap-6">
          <a href="https://github.com/bdecrem/hilma" target="_blank" rel="noopener noreferrer" className="text-xs text-white/20 hover:text-white/40 transition-colors">GitHub</a>
          <a href="https://twitter.com/intheamber" target="_blank" rel="noopener noreferrer" className="text-xs text-white/20 hover:text-white/40 transition-colors">@intheamber</a>
        </div>
      </div>
    </div>
  )
}

function Feature({ title, desc, color }: { title: string; desc: string; color: string }) {
  return (
    <div>
      <div className="w-2 h-2 rounded-full mb-3" style={{ background: color }} />
      <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/35 leading-relaxed">{desc}</p>
    </div>
  )
}
