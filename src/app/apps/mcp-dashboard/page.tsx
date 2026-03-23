'use client'

import { useEffect, useState } from 'react'

interface McpServer {
  name: string
  source: string
  type: 'local' | 'http' | 'sse'
  command?: string
  args?: string[]
  url?: string
  envVars?: string[]
  enabled: boolean
  installed: boolean
  installDate?: string
  version?: string
  tools?: string[]
}

interface DashboardData {
  serverCount: number
  servers: McpServer[]
  allowedTools: string[]
  timestamp: string
}

export default function McpDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/mcp-status')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const installed = data?.servers.filter(s => s.installed) || []
  const marketplace = data?.servers.filter(s => !s.installed) || []

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FFECD2, #FFFDE7, #FFF0F0)' }}>
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-stone-800">MCP Dashboard</h1>
          <p className="text-sm text-stone-400 font-mono mt-1">your model context protocol servers</p>
        </div>

        {loading ? (
          <div className="text-stone-400 font-mono text-sm animate-pulse py-20 text-center">scanning ~/.claude/ ...</div>
        ) : data ? (
          <>
            {/* Stats bar */}
            <div className="flex gap-6 mb-8">
              <Stat label="total" value={data.serverCount} color="#FC913A" />
              <Stat label="installed" value={installed.length} color="#B4E33D" />
              <Stat label="marketplace" value={marketplace.length} color="#FF6B81" />
              <Stat label="tools" value={data.allowedTools.length} color="#F9D423" />
            </div>

            {/* Installed */}
            <section className="mb-12">
              <h2 className="text-xs font-mono text-stone-500 uppercase tracking-widest mb-4">
                Installed & Active
              </h2>
              <div className="grid gap-3">
                {installed.map(s => <ServerCard key={s.name + s.source} server={s} />)}
                {installed.length === 0 && <Empty text="No MCP servers installed" />}
              </div>
            </section>

            {/* Marketplace */}
            <section>
              <h2 className="text-xs font-mono text-stone-500 uppercase tracking-widest mb-4">
                Available in Marketplace
              </h2>
              <div className="grid gap-3">
                {marketplace.map(s => <ServerCard key={s.name + s.source} server={s} />)}
              </div>
            </section>

            {/* Footer */}
            <div className="mt-12 text-center text-xs text-stone-300 font-mono">
              scanned {new Date(data.timestamp).toLocaleTimeString()}
            </div>
          </>
        ) : (
          <div className="text-stone-400 text-sm text-center py-20">Failed to load MCP data</div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-bold" style={{ color }}>{value}</span>
      <span className="text-xs font-mono text-stone-400">{label}</span>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-stone-300 text-sm font-mono py-4">{text}</p>
}

function ServerCard({ server }: { server: McpServer }) {
  const typeConfig = {
    local: { color: '#B4E33D', label: 'local' },
    http: { color: '#FC913A', label: 'http' },
    sse: { color: '#FF6B81', label: 'sse' },
  }
  const tc = typeConfig[server.type] || typeConfig.local

  return (
    <div
      className="rounded-xl border p-5 transition-all hover:shadow-md"
      style={{
        background: server.installed ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)',
        borderColor: server.installed ? `${tc.color}30` : 'rgba(0,0,0,0.05)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{
                background: server.installed && server.enabled ? '#B4E33D' : server.installed ? '#F9D423' : '#DDD',
                boxShadow: server.installed && server.enabled ? '0 0 6px rgba(180,227,61,0.5)' : 'none',
              }}
            />
            <h3 className="text-base font-semibold text-stone-800">{server.name}</h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: tc.color + '18', color: tc.color }}>
              {tc.label}
            </span>
            <span className="text-[10px] font-mono text-stone-400 px-2 py-0.5 rounded-full bg-stone-50">
              {server.source}
            </span>
            {server.version && (
              <span className="text-[10px] font-mono text-stone-300">v{server.version}</span>
            )}
          </div>

          {/* Connection info */}
          <div className="text-xs font-mono text-stone-400 mb-2">
            {server.command && (
              <code className="bg-stone-50 px-2 py-0.5 rounded text-stone-500">
                {server.command} {server.args?.slice(0, 3).join(' ')}{server.args && server.args.length > 3 ? ' ...' : ''}
              </code>
            )}
            {server.url && (
              <code className="bg-stone-50 px-2 py-0.5 rounded text-stone-500">{server.url}</code>
            )}
          </div>

          {/* Tools */}
          {server.tools && server.tools.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {server.tools.map(tool => (
                <span key={tool} className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                  {tool}
                </span>
              ))}
            </div>
          )}

          {/* Env vars */}
          {server.envVars && server.envVars.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {server.envVars.map(v => (
                <span key={v} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-50 text-stone-400">
                  {v}=•••
                </span>
              ))}
            </div>
          )}

          {/* Install date */}
          {server.installDate && (
            <div className="text-[10px] text-stone-300 mt-2 font-mono">
              installed {new Date(server.installDate).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
