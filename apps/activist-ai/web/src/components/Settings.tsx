// The project's settings: today one, "Fallback to Claude". Off unless the project's owner turns
// it on, after reading what it means and confirming. With it on: when Claude takes over by itself
// (three stops, the first the default), and this month's use against the ceiling.
import { createEffect, createSignal, For, Show } from 'solid-js'
import type { Ola } from '../lib/ola.ts'
import type { ClaudeAuto, Problem } from '../lib/types.ts'
import { claude, DeskError } from '../lib/api.ts'
import { ProblemBox } from './Drawer.tsx'

export const CONSENT =
  'When this is on, you can hand a request to Claude Code, run with Anthropic’s Claude. Your request, and the parts of your files Claude reads to answer it, leave this machine and go to Anthropic. It is off unless you turn it on. Every use is marked, and you can turn it off at any time.'

const STOPS: { value: ClaudeAuto; label: string; hint: string }[] = [
  { value: 'ask', label: 'Only when I ask', hint: 'Claude works only on a request you hand to it.' },
  { value: 'stuck', label: 'When Ola gets stuck', hint: 'If Ola’s work ends in an error, reaches the most it may do for one request, or three of its steps in a row do not work, Claude tries the same request and you are told why.' },
  { value: 'always', label: 'Always use Claude', hint: 'Every request goes to Claude. You can still pick Ola for one request.' },
]

const money = (n: number) => `$${n.toFixed(2)}`
// On Bart's subscription the ceiling is counted in tokens, which mean nothing to a reader: a share.
const share = (used: number, cap: number) => {
  const pct = cap > 0 ? (used / cap) * 100 : 100
  return `${pct > 0 && pct < 1 ? 'Less than 1%' : `${Math.min(100, Math.round(pct))}%`} of this month’s share used`
}

export function SettingsView(props: { ola: Ola; titleRef?: (el: HTMLHeadingElement) => void }) {
  const info = () => props.ola.state.claude
  const [busy, setBusy] = createSignal(false)
  const [problem, setProblem] = createSignal<Problem | null>(null)
  const [asking, setAsking] = createSignal(false)
  let confirm: HTMLDialogElement | undefined
  createEffect(() => {
    if (!confirm) return
    if (asking() && !confirm.open) confirm.showModal()
    else if (!asking() && confirm.open) confirm.close()
  })
  const change = async (body: { enabled?: boolean; consent?: boolean; auto?: ClaudeAuto }) => {
    setBusy(true)
    setProblem(null)
    try {
      await claude.settings(body)
      await props.ola.loadClaude()
    } catch (e) {
      setProblem(e instanceof DeskError ? e.problem : { text: 'The change did not reach Ola’s computer. Nothing was changed.', detail: String(e) })
    } finally {
      setBusy(false)
      setAsking(false)
    }
  }
  const disabled = () => busy() || !info()?.canChange || (!info()?.enabled && !info()?.configured)

  return (
    <section class="files-sheet settings" aria-labelledby="settings-title">
      <div class="files-inner">
        <div class="files-top">
          <div>
            <h1 id="settings-title" class="files-title" ref={props.titleRef} tabindex="-1">
              Settings
            </h1>
            <p class="files-lede">How this project works. Only its owner can change these.</p>
          </div>
        </div>

        <Show when={problem()}>{(p) => <ProblemBox problem={p()} role="alert" />}</Show>
        <Show when={info()} fallback={<p class="loading" role="status">Loading the settings…</p>}>
          {(i) => (
            <div class="setting">
              <div class="setting-row">
                <div class="setting-text">
                  <h2 class="setting-name" id="claude-setting">
                    Fallback to Claude
                  </h2>
                  <p class="setting-say">{i().enabled ? 'On. You can hand a request to Claude, which runs outside this machine.' : 'Off. Everything you ask is done by Ola, on this machine.'}</p>
                </div>
                <button
                  type="button"
                  class="switch"
                  role="switch"
                  aria-checked={i().enabled}
                  aria-labelledby="claude-setting"
                  disabled={disabled()}
                  onClick={() => (i().enabled ? void change({ enabled: false }) : setAsking(true))}
                >
                  <span class="switch-knob" aria-hidden="true" />
                  <span class="switch-word">{i().enabled ? 'On' : 'Off'}</span>
                </button>
              </div>
              <Show when={!i().enabled && i().unavailable}>
                <p class="setting-note">{i().unavailable}</p>
              </Show>
              <Show when={!i().canChange}>
                <p class="setting-note">Only the project’s owner can turn this on or off.</p>
              </Show>

              <Show when={i().enabled}>
                <fieldset class="setting-stops" disabled={busy() || !i().canChange}>
                  <legend class="setting-name small">When Claude takes over by itself</legend>
                  <div class="stops">
                    <For each={STOPS}>
                      {(stop) => (
                        <label class="stop" classList={{ on: i().auto === stop.value }}>
                          <input type="radio" name="claude-auto" value={stop.value} checked={i().auto === stop.value} onChange={() => void change({ auto: stop.value })} />
                          <span class="stop-label">{stop.label}</span>
                          <span class="stop-hint">{stop.hint}</span>
                        </label>
                      )}
                    </For>
                  </div>
                </fieldset>
                <dl class="facts">
                  <div>
                    <dt>This month</dt>
                    <dd>
                      <Show when={i().month.reported} fallback="Not known just now.">
                        {i().month.unit === 'usd' ? `${money(i().month.used)} of ${money(i().month.cap)}` : share(i().month.used, i().month.cap)}
                      </Show>
                    </dd>
                  </div>
                  <div>
                    <dt>When the month’s share is used</dt>
                    <dd>Claude stops taking requests from this project until the first of next month. Ola keeps working.</dd>
                  </div>
                  <div>
                    <dt>What leaves this machine</dt>
                    <dd>Only for a request handed to Claude: the request, and the parts of your files Claude reads to answer it. Each one is marked “Claude, outside this machine”.</dd>
                  </div>
                </dl>
              </Show>
            </div>
          )}
        </Show>
      </div>

      <dialog ref={confirm} class="sheet confirm" aria-labelledby="claude-confirm-title" aria-describedby="claude-confirm-text" onClose={() => setAsking(false)}>
        <div class="sheet-inner">
          <h2 id="claude-confirm-title" class="sheet-title">
            Turn on Fallback to Claude?
          </h2>
          <p id="claude-confirm-text" class="sheet-lede">
            {CONSENT}
          </p>
          <div class="sheet-actions">
            <button type="button" class="primary-button" disabled={busy()} onClick={() => void change({ enabled: true, consent: true })}>
              Turn it on
            </button>
            <button type="button" class="ghost-button on-paper" disabled={busy()} onClick={() => setAsking(false)}>
              Not now
            </button>
          </div>
        </div>
      </dialog>
    </section>
  )
}
