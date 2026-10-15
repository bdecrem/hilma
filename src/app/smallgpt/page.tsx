import { STARTED, STEPS, counted } from './steps'

function fmt(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export default function SmallGptPage() {
  const done = counted(STEPS).filter((s) => s.status === 'done').length
  const pct = Math.round((done / counted(STEPS).length) * 100)

  return (
    <main className="sg-page">
      <p className="sg-kicker">smallgpt</p>
      <h1>Building a GPT, one step at a time.</h1>
      <p className="sg-lead">
        Bart builds a complete GPT at toy scale and touches every mechanism along the way — from a tokenizer and
        backpropagation through pretraining, SFT, DPO and RLVR.
      </p>
      <p className="sg-lead">
        The goal is understanding, not a useful model. Fourteen steps; each one is built only after the last one is
        understood, and each ends with something you can see.
      </p>

      <div className="sg-progress">
        <span>
          {done} of {counted(STEPS).length} done
        </span>
        <div className="sg-bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
        <span>started {fmt(STARTED)}</span>
      </div>

      <ol className="sg-steps">
        {STEPS.map((s) => (
          <li key={s.n} className={`sg-step ${s.status}`}>
            <span className="sg-mark" aria-hidden>
              {s.status === 'done' ? '✓' : s.n}
            </span>
            <div className="sg-head">
              <h2 className="sg-name">
                {s.n} · {s.name}
              </h2>
              {s.status === 'done' && s.doneOn && <span className="sg-tag">done {fmt(s.doneOn)}</span>}
              {s.status === 'next' && <span className="sg-tag">up next</span>}
            </div>
            <p className="sg-idea">{s.idea}</p>
            {s.status === 'done' && (s.summary || s.saw) && (
              <div className="sg-note">
                {s.summary && (
                  <>
                    <h3>In Bart’s words</h3>
                    <p>{s.summary}</p>
                    {s.examples && (
                      <ol className="sg-examples">
                        {s.examples.map((e) => (
                          <li key={e.prompt}>
                            <span className="sg-prompt">{e.prompt}</span>
                            <span className="sg-pipe"> | </span>
                            {e.out}
                          </li>
                        ))}
                      </ol>
                    )}
                  </>
                )}
                {s.saw && (
                  <>
                    <h3>What we saw</h3>
                    <p className="sg-saw">{s.saw}</p>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      <p className="sg-foot">
        The plan, the code for each step and its notes live in <code>apps/smallgpt/</code> in the hilma repo. Steps 1–6 follow
        Karpathy’s “Zero to Hero”; the post-training steps use Hugging Face TRL with each loss written out by hand first.
      </p>
    </main>
  )
}
