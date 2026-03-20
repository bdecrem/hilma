'use client'

import { useState, useRef, useCallback } from 'react'

export default function WriterPage() {
  const [prompt, setPrompt] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [temperature, setTemperature] = useState(1.0)
  const [topP, setTopP] = useState(0.95)
  const [topK, setTopK] = useState(80)
  const abortRef = useRef<AbortController | null>(null)

  const generate = useCallback(async () => {
    if (!prompt.trim() || loading) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setOutput('')
    setLoading(true)

    try {
      const res = await fetch('/api/writer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), temperature, topP, topK }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const err = await res.json()
        setOutput(`Error: ${err.error || 'Something went wrong'}`)
        setLoading(false)
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        setOutput('Error: No response stream')
        setLoading(false)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') break

          try {
            const parsed = JSON.parse(data)
            const text = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.text
            if (text) {
              setOutput(prev => prev + text)
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setOutput(prev => prev || 'Error: Failed to connect')
    } finally {
      setLoading(false)
    }
  }, [prompt, temperature, topP, topK, loading])

  return (
    <div className="min-h-screen bg-[#08080c] text-white font-[family-name:var(--font-geist)]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-white/90">writer</h1>
          <p className="text-sm text-white/30 mt-1">raw text completion</p>
        </div>

        {/* Prompt */}
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="The man decided to take a shower."
          rows={4}
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-3 text-sm text-white/90 placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none font-[family-name:var(--font-geist-mono)]"
        />

        {/* Weirdness Dials */}
        <div className="mt-6 space-y-4">
          <p className="text-xs text-white/25 uppercase tracking-widest">weirdness dials</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SliderControl
              label="temperature"
              value={temperature}
              min={0.1}
              max={1.5}
              step={0.05}
              onChange={setTemperature}
            />
            <SliderControl
              label="top-p"
              value={topP}
              min={0.1}
              max={1.0}
              step={0.05}
              onChange={setTopP}
            />
            <SliderControl
              label="top-k"
              value={topK}
              min={1}
              max={100}
              step={1}
              onChange={setTopK}
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={generate}
            disabled={loading || !prompt.trim()}
            className="px-5 py-2 text-sm font-medium rounded-lg bg-white/10 text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'generating...' : 'generate'}
          </button>
          {output && !loading && (
            <button
              onClick={generate}
              className="px-5 py-2 text-sm font-medium rounded-lg bg-white/[0.05] text-white/50 hover:bg-white/10 hover:text-white/70 transition-colors"
            >
              regenerate
            </button>
          )}
        </div>

        {/* Output */}
        {(output || loading) && (
          <div className="mt-8 bg-white/[0.02] border border-white/[0.06] rounded-lg p-5">
            <pre className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed font-[family-name:var(--font-geist-mono)]">
              {output}
              {loading && <span className="inline-block w-[2px] h-[1em] bg-white/50 align-middle animate-pulse ml-[1px]" />}
            </pre>
          </div>
        )}

        {/* Model tag */}
        <p className="mt-8 text-[10px] text-white/15 text-center">
          meta-llama/Meta-Llama-3-8B-Instruct-Lite via Together.ai
        </p>
      </div>
    </div>
  )
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <span className="text-xs text-white/40">{label}</span>
        <span className="text-xs text-white/30 font-[family-name:var(--font-geist-mono)]">
          {Number.isInteger(step) ? value : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/60"
      />
    </div>
  )
}
