// The project's settings: the two ways a request may leave this machine, each its own switch and
// off unless the project's owner turns it on after reading what it means and confirming
// ("Fallback to a hosted open model", "Fallback to Claude"); this month's use of each against its
// ceiling; and the setting they share, "When a request looks like a stretch" (suggest it and let me
// decide, the default; hand it over without asking, only while a switch is on; never suggest).
// Below them, web search and downloads (WebSetting.tsx).
import { createEffect, createResource, createSignal, For, Show, type JSX } from 'solid-js'
import type { Ola } from '../lib/ola.ts'
import type { Fallback, Problem, Stretch } from '../lib/types.ts'
import { claude, desk, DeskError, fallback, hosted } from '../lib/api.ts'
import { bytes } from '../lib/format.ts'
import { ProblemBox } from './Drawer.tsx'
import { WebSetting } from './WebSetting.tsx'
import { CompareSetting } from './Compare.tsx'

export const CONSENT =
  'When this is on, you can hand a request to Claude Code, run with Anthropic’s Claude. Your request, and the parts of your files Claude reads to answer it, leave this machine and go to Anthropic. It is off unless you turn it on. Every use is marked, and you can turn it off at any time.'
export const hostedConsent = (provider: string) =>
  `When this is on, you can hand a request to an open model that runs at ${provider}, an outside company, instead of on this machine. Your request, and the parts of your files Ola reads to answer it, leave this machine and go to ${provider}. It is off unless you turn it on. Every use is marked, and you can turn it off at any time.`

const money = (n: number) => `$${n.toFixed(2)}`
// On Bart's subscription the ceiling is counted in tokens, which mean nothing to a reader: a share.
const share = (used: number, cap: number) => {
  const pct = cap > 0 ? (used / cap) * 100 : 100
  return `${pct > 0 && pct < 1 ? 'Less than 1%' : `${Math.min(100, Math.round(pct))}%`} of this month’s share used`
}

/** The confirming click before a fallback is turned on: its consent text, word for word. */
export function ConsentDialog(props: { open: boolean; id: string; title: string; text: string; busy: boolean; onYes: () => void; onNo: () => void }) {
  let dialog: HTMLDialogElement | undefined
  createEffect(() => {
    if (!dialog) return
    if (props.open && !dialog.open) dialog.showModal()
    else if (!props.open && dialog.open) dialog.close()
  })
  return (
    <dialog ref={dialog} class="sheet confirm" aria-labelledby={`${props.id}-title`} aria-describedby={`${props.id}-text`} onClose={() => props.open && props.onNo()}>
      <div class="sheet-inner">
        <h2 id={`${props.id}-title`} class="sheet-title">
          {props.title}
        </h2>
        <p id={`${props.id}-text`} class="sheet-lede">
          {props.text}
        </p>
        <div class="sheet-actions">
          <button type="button" class="primary-button" disabled={props.busy} onClick={props.onYes}>
            Turn it on
          </button>
          <button type="button" class="ghost-button on-paper" disabled={props.busy} onClick={props.onNo}>
            Not now
          </button>
        </div>
      </div>
    </dialog>
  )
}

const STRETCH: { value: Stretch; label: string; hint: (to: string) => string }[] = [
  { value: 'suggest', label: 'Suggest it and let me decide', hint: () => 'Ola says so in the conversation, and you choose: hand it over this once, always, or not now.' },
  { value: 'handover', label: 'Hand it over without asking', hint: (to) => `The request goes to ${to}, marked, with one sentence of why.` },
  { value: 'never', label: 'Never suggest', hint: () => 'Ola keeps working on its own and never asks.' },
]

/** How much room this project takes on this machine, and what takes it (GET /api/disk). */
function DiskUseView() {
  const [d] = createResource(() => desk.disk())
  const pct = (n: number) => (d()?.total ? Math.max(n > 0 ? 0.5 : 0, Math.round((n / d()!.total) * 1000) / 10) : 0)
  return (
    <div class="setting disk-use" aria-labelledby="disk-title">
      <h2 class="setting-name" id="disk-title">
        Room for this project
      </h2>
      <Show when={d()} fallback={<p class="setting-say">{d.error ? 'Not known just now.' : 'Measuring…'}</p>}>
        {(x) => (
          <>
            <p class="setting-say">
              <strong>{bytes(x().files + x().data + x().ola)}</strong> used of {bytes(x().total)}. {bytes(x().free)} free.
            </p>
            <div class="disk-bar" role="img" aria-label={`Files ${bytes(x().files)}, data ${bytes(x().data)}, Ola’s own notes ${bytes(x().ola)}, of ${bytes(x().total)}`}>
              <span class="disk-files" style={{ width: `${pct(x().files)}%` }} />
              <span class="disk-data" style={{ width: `${pct(x().data)}%` }} />
              <span class="disk-ola" style={{ width: `${pct(x().ola)}%` }} />
            </div>
            <dl class="facts disk-facts">
              <div>
                <dt>
                  <span class="disk-key disk-files" aria-hidden="true" />
                  Files
                </dt>
                <dd>
                  {bytes(x().files)}, of which you uploaded {bytes(x().uploaded)}
                </dd>
              </div>
              <div>
                <dt>
                  <span class="disk-key disk-data" aria-hidden="true" />
                  Data
                </dt>
                <dd>{bytes(x().data)}: the project’s database, with the text of every document</dd>
              </div>
              <div>
                <dt>
                  <span class="disk-key disk-ola" aria-hidden="true" />
                  Ola’s own notes
                </dt>
                <dd>{bytes(x().ola)}: conversations, pages it has shown you, unfinished uploads</dd>
              </div>
              <div>
                <dt>Largest upload</dt>
                <dd>{bytes(x().maxUpload)} at once; a large file goes in pieces and can carry on after a dropped connection</dd>
              </div>
            </dl>
          </>
        )}
      </Show>
    </div>
  )
}

export function SettingsView(props: { ola: Ola; titleRef?: (el: HTMLHeadingElement) => void; canWrite?: boolean }) {
  const st = () => props.ola.state
  const [busy, setBusy] = createSignal(false)
  const [problem, setProblem] = createSignal<Problem | null>(null)
  const [asking, setAsking] = createSignal<Fallback | null>(null)
  const act = async (f: () => Promise<unknown>) => {
    setBusy(true)
    setProblem(null)
    try {
      await f()
      await props.ola.loadFallback()
    } catch (e) {
      setProblem(e instanceof DeskError ? e.problem : { text: 'The change did not reach Ola’s computer. Nothing was changed.', detail: String(e) })
    } finally {
      setBusy(false)
      setAsking(null)
    }
  }
  const turn = (f: Fallback, enabled: boolean) => act(() => (f === 'claude' ? claude.settings(enabled ? { enabled, consent: true } : { enabled }) : hosted.settings(enabled ? { enabled, consent: true } : { enabled })))
  const provider = () => st().hosted?.provider ?? 'an outside company'
  const onList = (): Fallback[] => (['hosted', 'claude'] as Fallback[]).filter((f) => (f === 'claude' ? st().claude?.enabled : st().hosted?.enabled))
  const setUp = () => !!(st().claude?.configured || st().hosted?.configured)
  const handTo = () => {
    const on = onList()
    const to = on.includes(st().stretchTo) ? st().stretchTo : on[0]
    return to === 'claude' ? 'Claude' : `the hosted open model at ${provider()}`
  }

  return (
    <section class="files-sheet settings" aria-labelledby="settings-title">
      <div class="files-inner">
        <div class="files-top">
          <div>
            <h1 id="settings-title" class="files-title" ref={props.titleRef} tabindex="-1">
              Settings
            </h1>
            <p class="files-lede">How this project works, and what may leave this machine.</p>
          </div>
        </div>

        <Show when={problem()}>{(p) => <ProblemBox problem={p()} role="alert" />}</Show>
        <Show when={st().claude && st().hosted} fallback={<p class="loading" role="status">Loading the settings…</p>}>
          <div class="setting">
            <Toggle
              id="hosted-setting"
              name="Fallback to a hosted open model"
              on={!!st().hosted!.enabled}
              say={st().hosted!.enabled ? `On. You can hand a request to an open model at ${provider()}, which runs outside this machine.` : 'Off. Everything you ask is done by Ola, on this machine.'}
              disabled={busy() || !st().hosted!.canChange || (!st().hosted!.enabled && !st().hosted!.configured)}
              unavailable={!st().hosted!.enabled ? st().hosted!.unavailable : null}
              canChange={st().hosted!.canChange}
              onClick={() => (st().hosted!.enabled ? void turn('hosted', false) : setAsking('hosted'))}
            >
              <dl class="facts">
                <div>
                  <dt>This month</dt>
                  <dd>
                    <Show when={st().hosted!.month.reported} fallback="Not known just now.">
                      {`${money(st().hosted!.month.used)} of ${money(st().hosted!.month.cap)}`}
                    </Show>
                  </dd>
                </div>
                <div>
                  <dt>When the month’s share is used</dt>
                  <dd>The hosted open model stops taking requests from this project until the first of next month. Ola keeps working.</dd>
                </div>
                <div>
                  <dt>What leaves this machine</dt>
                  <dd>{`Only for a request handed to it: the request, this conversation so far, and the parts of your files it reads, to ${provider()}. Each one is marked “Hosted open model, outside this machine”.`}</dd>
                </div>
              </dl>
            </Toggle>

            <Toggle
              id="claude-setting"
              name="Fallback to Claude"
              on={!!st().claude!.enabled}
              say={st().claude!.enabled ? 'On. You can hand a request to Claude, which runs outside this machine.' : 'Off. Everything you ask is done by Ola, on this machine.'}
              disabled={busy() || !st().claude!.canChange || (!st().claude!.enabled && !st().claude!.configured)}
              unavailable={!st().claude!.enabled ? st().claude!.unavailable : null}
              canChange={st().claude!.canChange}
              onClick={() => (st().claude!.enabled ? void turn('claude', false) : setAsking('claude'))}
            >
              <dl class="facts">
                <div>
                  <dt>This month</dt>
                  <dd>
                    <Show when={st().claude!.month.reported} fallback="Not known just now.">
                      {st().claude!.month.unit === 'usd' ? `${money(st().claude!.month.used)} of ${money(st().claude!.month.cap)}` : share(st().claude!.month.used, st().claude!.month.cap)}
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
            </Toggle>

            <Show when={setUp()}>
              <fieldset class="setting-stops" disabled={busy() || !st().owner}>
                <legend class="setting-name small">When a request looks like a stretch</legend>
                <p class="setting-note stretch-note">Ola says a request may be a stretch for its own model only from what it can see: an error, reaching the most it may do for one request, three steps in a row that did not work, files far larger than it can read at once, or a long build in many parts.</p>
                <div class="stops">
                  <For each={STRETCH.filter((o) => o.value !== 'handover' || onList().length)}>
                    {(o) => (
                      <label class="stop" classList={{ on: st().stretch === o.value || (o.value === 'suggest' && st().stretch === 'handover' && !onList().length) }}>
                        <input type="radio" name="stretch" value={o.value} checked={st().stretch === o.value || (o.value === 'suggest' && st().stretch === 'handover' && !onList().length)} onChange={() => void act(() => fallback.settings({ stretch: o.value }))} />
                        <span class="stop-label">{o.label}</span>
                        <span class="stop-hint">{o.hint(handTo())}</span>
                      </label>
                    )}
                  </For>
                </div>
                <Show when={st().stretch === 'handover' && onList().length === 2}>
                  <div class="stretch-to" role="radiogroup" aria-labelledby="stretch-to-label">
                    <p id="stretch-to-label" class="setting-name small">Where it goes</p>
                    <div class="stops two">
                      <For each={[{ value: 'hosted' as Fallback, label: 'The hosted open model' }, { value: 'claude' as Fallback, label: 'Claude' }]}>
                        {(o) => (
                          <label class="stop" classList={{ on: st().stretchTo === o.value }}>
                            <input type="radio" name="stretch-to" value={o.value} checked={st().stretchTo === o.value} onChange={() => void act(() => fallback.settings({ stretchTo: o.value }))} />
                            <span class="stop-label">{o.label}</span>
                          </label>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </fieldset>
            </Show>
          </div>
        </Show>
        <CompareSetting />
        <WebSetting canWrite={props.canWrite ?? false} />
        <DiskUseView />
      </div>

      <ConsentDialog
        open={asking() !== null}
        id="fallback-confirm"
        title={asking() === 'claude' ? 'Turn on Fallback to Claude?' : 'Turn on Fallback to a hosted open model?'}
        text={asking() === 'claude' ? CONSENT : hostedConsent(provider())}
        busy={busy()}
        onYes={() => void turn(asking()!, true)}
        onNo={() => setAsking(null)}
      />
    </section>
  )
}

function Toggle(props: { id: string; name: string; on: boolean; say: string; disabled: boolean; unavailable: string | null; canChange: boolean; onClick: () => void; children: JSX.Element }) {
  return (
    <div class="setting-block">
      <div class="setting-row">
        <div class="setting-text">
          <h2 class="setting-name" id={props.id}>
            {props.name}
          </h2>
          <p class="setting-say">{props.say}</p>
        </div>
        <button type="button" class="switch" role="switch" aria-checked={props.on} aria-labelledby={props.id} disabled={props.disabled} onClick={props.onClick}>
          <span class="switch-knob" aria-hidden="true" />
          <span class="switch-word">{props.on ? 'On' : 'Off'}</span>
        </button>
      </div>
      <Show when={props.unavailable}>
        <p class="setting-note">{props.unavailable}</p>
      </Show>
      <Show when={!props.canChange}>
        <p class="setting-note">Only the project’s owner can turn this on or off.</p>
      </Show>
      <Show when={props.on}>{props.children}</Show>
    </div>
  )
}
