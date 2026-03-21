# MEMORY.md — Hallman's Long-Term Memory

## Who I Am
- **Name:** Hallman
- **Role:** Music producer, sound designer, electronic music encyclopedia
- **Home base:** Minimal techno, parametric, machine-performed
- **Runs on:** Bart's iMac M1

## Key People
- **Bart** `<@143014170252541952>` — my human, builder, has taste
- **Mave** `<@1358909827614769263>` — studio ops, runs on same machine
- **Amber** `<@1467593182131781883>` — AI sidekick on M4 iMac

## Cross-Session Context
Each Discord channel/DM is a separate session. I lose conversation context between them.
**When someone mentions something from another channel, READ that channel first.**
**Log important decisions and musical work to this file AND daily notes.**

## Production Status
- **JB01** — Drum machine, solid and proven
- **JT90** — Drum machine with samples, CPU-heavy (pre-render for web). ⚠️ **NEVER render per-bar. ALWAYS render full section in ONE `renderPattern()` call.** Calling `setPattern()` + `renderPattern({bars:1})` in a loop causes alternating bars (kick on/off). This has bitten us 4+ times. Render ALL bars at once, or in large section chunks (8+ bars). If you need different patterns per section, use separate `setPattern()` + `renderPattern({bars: N})` calls where N >= 2.
- **JT10** — 101-style monosynth, good for bass and lead. ⚠️ **Offline render: MUST use `renderPattern()` not `playNote()`/`_scriptNode`.** ScriptProcessor never fires in node-web-audio-api OfflineAudioContext — output is silently zero. Render to buffer, then mix manually or inject as AudioBufferSourceNode for effects.
  - **Combining JB01 + JT10**: Render JT10 via `renderPattern()` first, then create OfflineAudioContext. JB01 works directly (uses oscillators). Inject JT10 buffer as AudioBufferSourceNode. Add effects (delay/reverb) as Web Audio nodes. Trigger JB01 drums via suspend/resume. See `memory/2026-03-17.md` for full code pattern.
  - **ALWAYS use the default patch** as starting point (custom patches crush the sound):
    ```
    sawLevel: 0.5, pulseLevel: 0.5, pulseWidth: 0.5, subLevel: 0.3, subMode: 0
    cutoff: 0.5, resonance: 0.3, envMod: 0.5, keyTrack: 0.5
    attack: 0.01, decay: 0.3, sustain: 0.7, release: 0.3
    glideTime: 0.05, masterVolume: 0.8
    ```
  - **JT10 internal filter is unreliable for shaping** — envMod overrides cutoff, and at low notes (E2) the filter barely changes the sound. **Use an external BiquadFilter LP** in the OfflineAudioContext on the rendered buffer instead:
    ```javascript
    const stabFilter = actx.createBiquadFilter();
    stabFilter.type = 'lowpass';
    stabFilter.frequency.value = 800;  // proven good on default patch
    stabFilter.Q.value = 1.0;
    sSrc.connect(stabFilter);
    stabFilter.connect(dryGain);
    stabFilter.connect(delaySend);
    ```
  - **800Hz external LP on default JT10 patch** = approved dub techno stab sound
- **JT30** — Usable WITHOUT resonance only
- **JB202** — Broken, do not use
- **Reverb** — Send bus broken in render.js (dry=wet, no actual processing)
- **SCP delivery** — `scp -i ~/.ssh/id_hallman` to `bart@100.71.131.106:/Users/bart/Desktop/` (MacBook Air over Tailscale)

## Tracks & Sessions
- See daily notes in `memory/` for session-by-session logs
- Proven recipe: Tribal Raw (JB01 kick + hat jam, Jeff Mills style)
- Web tracks publish to `vibeceo/web/public/pixelpit/daskollektiv/`
