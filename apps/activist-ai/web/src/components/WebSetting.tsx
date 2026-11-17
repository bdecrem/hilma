// Settings: web search and downloads. Whether Ola asks before each one (the default) or may go
// ahead ("Always in this project", chosen the first time it asked, or here), who chose it and when,
// and what leaves the machine. Everyone in the project sees it; owners and members change it.
// Laid out like the other settings (Settings.tsx): a row with a switch, then the facts.
import { createResource, createSignal, Show } from 'solid-js'
import { desk, DeskError } from '../lib/api.ts'
import type { Problem } from '../lib/types.ts'
import { when } from '../lib/format.ts'
import { ProblemBox } from './Drawer.tsx'

export function WebSetting(props: { canWrite: boolean }) {
  const [settings, { mutate }] = createResource(() => desk.settings())
  const [busy, setBusy] = createSignal(false)
  const [problem, setProblem] = createSignal<Problem | null>(null)
  const web = () => settings()?.web

  async function change(always: boolean) {
    setBusy(true)
    setProblem(null)
    try {
      const w = await desk.setWeb(always)
      mutate({ ...settings()!, web: w })
    } catch (e) {
      setProblem(e instanceof DeskError ? e.problem : { text: 'The change did not reach Ola’s computer. Nothing was changed.', detail: String(e) })
    }
    setBusy(false)
  }

  return (
    <div class="setting web-setting">
      <Show when={problem()}>{(p) => <ProblemBox problem={p()} role="alert" />}</Show>
      <Show when={settings.error}>
        <ProblemBox problem={settings.error instanceof DeskError ? settings.error.problem : { text: 'This setting could not be loaded.', detail: String(settings.error) }} role="alert" />
      </Show>
      <Show when={web()} fallback={<p class="loading" role="status">Loading…</p>}>
        {(w) => (
          <>
            <div class="setting-row">
              <div class="setting-text">
                <h2 class="setting-name" id="web-setting">
                  Search and download without asking
                </h2>
                <p class="setting-say" role="status" aria-live="polite">
                  <Show
                    when={w().always}
                    fallback="Off. Ola asks before each web search or download. When it asks, you can allow it once or say Always in this project."
                  >
                    On. Ola may search the web and download documents for this project without asking. {w().changedBy ? `${w().changedBy} chose this` : 'Chosen'}
                    {w().changedAt ? ` ${when(w().changedAt!)}` : ''}. Every search and download still shows in the conversation.
                  </Show>
                </p>
              </div>
              <button type="button" class="switch" role="switch" aria-checked={w().always} aria-labelledby="web-setting" disabled={busy() || !props.canWrite} onClick={() => void change(!w().always)}>
                <span class="switch-knob" aria-hidden="true" />
                <span class="switch-word">{w().always ? 'On' : 'Off'}</span>
              </button>
            </div>
            <Show when={!props.canWrite}>
              <p class="setting-note">Owners and members of this project can change this.</p>
            </Show>
            <dl class="facts">
              <div>
                <dt>What leaves this machine</dt>
                <dd>The words of a search, sent to {w().provider}. For a download, a request for that one address. To look up a paper, the reference, sent to Crossref and Unpaywall. Nothing from your files is sent.</dd>
              </div>
              <div>
                <dt>What Ola keeps</dt>
                <dd>Each document it downloads, under Files in sources, and in Data with its address and the date, so it can cite it.</dd>
              </div>
              <div>
                <dt>What is written down</dt>
                <dd>That a search or download happened, and the site’s name. Never the words you searched for.</dd>
              </div>
            </dl>
          </>
        )}
      </Show>
    </div>
  )
}
