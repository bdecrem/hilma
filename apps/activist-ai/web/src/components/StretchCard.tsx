// The stretch card: in the conversation, when a request looks like a stretch for Ola's own model
// (lib/ola.ts planFor), Ola says so and the person decides. The approval sheet's sibling: the same
// paper, the same type and the same three answers in a row, set in the conversation instead of over
// it, and calm (no alarm color, no icon): Just this once / Always in this project / Not now. With
// both fallbacks possible, the hosted open model is offered first and "or Claude" switches the card.
// For a member while the switches are off, the card says who can turn it on and sends nothing.
import { createSignal, Show } from 'solid-js'
import { fallbackPlace, type Ola } from '../lib/ola.ts'
import { STRETCH_WHY } from '../lib/steps.ts'
import { DEAD_TITLE, DEAD_TITLE_BIGGER, deadLines, deadOffer } from '../lib/poke.ts'
import type { Fallback } from '../lib/types.ts'
import { CONSENT, ConsentDialog, hostedConsent } from './Settings.tsx'

export function StretchCard(props: { ola: Ola }) {
  const st = () => props.ola.state
  const s = () => st().suggestion!
  const [asking, setAsking] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const provider = () => st().hosted?.provider ?? null
  const on = (f: Fallback) => (f === 'claude' ? !!st().claude?.enabled : !!st().hosted?.enabled)
  const named = (f: Fallback) => (f === 'claude' ? 'Claude' : `the hosted open model at ${provider() ?? 'an outside company'}`)
  const other = () => s().offers.find((o) => o !== s().target) ?? null
  const answer = async (a: 'once' | 'always' | 'not_now') => {
    setBusy(true)
    await props.ola.answerSuggestion(a)
    setBusy(false)
    setAsking(false)
  }
  const always = () => (on(s().target) ? void answer('always') : setAsking(true))
  const id = () => `stretch-${s().id}`
  // OLA-522: the page still has dead things after Ola's one fix. What does not work, in plain sentences,
  // and one question with two answers when the bigger model can be used here; else only "OK".
  if (s().reason === 'dead')
    return (
      <section class="stretch-card" aria-labelledby={`${id()}-title`} aria-describedby={`${id()}-why`}>
        <h3 id={`${id()}-title`} class="stretch-title">
          {s().bigger ? DEAD_TITLE_BIGGER : DEAD_TITLE}
        </h3>
        <ul id={`${id()}-why`} class="stretch-why">
          {deadLines(s().dead ?? []).map((d) => (
            <li>{d}</li>
          ))}
        </ul>
        <Show when={s().canAct}>
          <p class="stretch-leaves">{deadOffer(provider())}</p>
        </Show>
        <div class="sheet-actions stretch-actions">
          <Show
            when={s().canAct}
            fallback={
              <button type="button" class="ghost-button on-paper" disabled={busy()} onClick={() => void answer('not_now')}>
                OK
              </button>
            }
          >
            <button type="button" class="primary-button" disabled={busy()} onClick={() => void answer('once')}>
              Yes, try it
            </button>
            <button type="button" class="ghost-button on-paper" disabled={busy()} onClick={() => void answer('not_now')}>
              No
            </button>
          </Show>
        </div>
      </section>
    )
  return (
    <section class="stretch-card" aria-labelledby={`${id()}-title`} aria-describedby={`${id()}-why`}>
      <Show when={s().turnId === null}>
        <p class="stretch-request">
          <span class="who">You</span> {s().request}
        </p>
      </Show>
      <h3 id={`${id()}-title`} class="stretch-title">
        {s().canAct ? `This may be a stretch for Ola’s own model. Hand it to ${named(s().target)}?` : 'This may be a stretch for Ola’s own model.'}
      </h3>
      <p id={`${id()}-why`} class="stretch-why">
        {STRETCH_WHY[s().reason]} {s().turnId ? 'What Ola did so far stays as it is.' : 'Ola has not started on it.'}
      </p>
      <Show
        when={s().canAct}
        fallback={
          <p class="stretch-leaves">
            {`The project’s owner can turn on handing requests like this to ${s().offers.map((o) => (o === 'claude' ? 'Claude' : 'the hosted open model')).join(' or ')}, in Settings. Until then, everything stays on this machine.`}
          </p>
        }
      >
        <p class="stretch-leaves">{`If you hand it over, your request, this conversation so far, and the parts of your files it reads leave this machine and go to ${fallbackPlace(s().target, provider())}.`}</p>
      </Show>
      <div class="sheet-actions stretch-actions">
        <Show when={s().canAct}>
          <button type="button" class="primary-button" disabled={busy()} onClick={() => void answer('once')}>
            Just this once
          </button>
          <Show when={st().owner}>
            <button type="button" class="ghost-button on-paper" disabled={busy()} onClick={always}>
              Always in this project
            </button>
          </Show>
        </Show>
        {/* With nothing to choose (a member, the switches off), the only answer is to read on: "OK". */}
        <button type="button" class="ghost-button on-paper" disabled={busy()} onClick={() => void answer('not_now')}>
          {s().canAct ? 'Not now' : 'OK'}
        </button>
      </div>
      <Show when={s().canAct && other()}>
        <p class="stretch-other">
          <button type="button" class="link-button on-paper" disabled={busy()} onClick={() => props.ola.switchSuggestion()}>
            {other() === 'claude' ? 'or Claude' : 'or the hosted open model'}
          </button>
        </p>
      </Show>
      <Show when={s().canAct && st().owner}>
        <ConsentDialog
          open={asking()}
          id={`${id()}-consent`}
          title={s().target === 'claude' ? 'Turn on Fallback to Claude?' : 'Turn on Fallback to a hosted open model?'}
          text={s().target === 'claude' ? CONSENT : hostedConsent(provider() ?? 'an outside company')}
          busy={busy()}
          onYes={() => void answer('always')}
          onNo={() => setAsking(false)}
        />
      </Show>
    </section>
  )
}
