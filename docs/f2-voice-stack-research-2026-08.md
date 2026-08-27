# Voice stack research — is OpenAI Realtime still the right choice?

Date: 2026-08-26. Research only; no code changed.

The question: Dodo voice mode + Final Reviews run on OpenAI Realtime. It's
live, full-duplex, practical — but it's a different brain than Dodo's chat
(Claude), and Bart finds the voices grating. Is Realtime still the best
trade-off between reliability, features, and integration?

## What we run today

- `gpt-realtime-2.1` (already the newest tier), default voice Marin, with a
  user-facing voice picker (8 voices incl. Cedar) and a 400-char per-user
  style instruction. WebSocket transport in Dodo; Peri uses WebRTC.
- Claude never left the loop where it counts: Final Review **grading** is a
  separate pass over the transcript (`judgeFinalReview`, big-model Claude).
  The Realtime model only *conducts* the exam and chats.
- Tool calls are client-mediated; `user_id` is derived server-side.

Decomposing the two complaints:

1. **"Different LLM."** The correctness-critical work (grading, card
   generation, chat) is already Claude. What actually suffers is in-session
   pedagogy and persona — the examiner doesn't sound like Dodo-the-tutor.
   Real, but smaller than it feels.
2. **"Grating voice."** We're already at OpenAI's ceiling: Marin/Cedar are
   their 2026 flagship voices and Bart has the picker. This complaint
   indicts the vendor's voice character, not our configuration.

## The field, August 2026

| Option | Brain | Voice quality | Latency/duplex | Integration from here | Cost (rough) |
|---|---|---|---|---|---|
| **OpenAI Realtime** (`gpt-realtime-2.x`) | GPT‑5-class, 128K ctx, parallel tools, 96.6% Big Bench Audio | Marin/Cedar — best they have; character is the ceiling | Best-in-class native full duplex | **Zero — built and battle-tested** | ~$0.30–0.45/min blended |
| **Anthropic** | Claude (perfect) | n/a | n/a | **No developer audio API exists** — Messages API audio is an open feature request (Feb 2026); voice is consumer-app only (Claude app, Claude Code dictation) | n/a |
| **Gemini Live** (2.5 Flash native audio) | Gemini — still not our brain | 30 HD voices, strong affective dialog | Native full duplex, GA on Vertex with SLAs | Full client + server rewrite | ~$0.12/min (cheapest) |
| **Hand-rolled cascade** (LiveKit Agents / Pipecat: STT → Claude → TTS) | **Claude** | Any TTS (ElevenLabs/Cartesia — best in market) | Sub-500 ms achievable; industry median 1.4–1.7 s — "good enough" is real engineering | Largest: replace client transport + build agent-worker infra, 3 vendors | STT ~$0.02 + TTS ~$0.03–0.10 + Claude tokens |
| **Hume EVI 3/4, custom-LLM socket** | **Claude** (their CLM socket sends convo + prosody context to *our* server; we reply with text) | Expressive/empathic voices, custom voices | Full-duplex feel; CLM adds one network hop | Medium: swap client to Hume SDK; tools move fully server-side into the CLM handler (cleaner than today) | ~$0.07–0.10/min + Claude tokens |
| **ElevenLabs Agents** | **Claude** (custom LLM supported) | **Best voice character in the market; could mint a signature Dodo voice** | Full-duplex platform loop | Medium: same shape as Hume | $0.08/min platform + LLM passthrough (~$0.10–0.30 landed) |

Notes on the eliminations:

- **Waiting for Anthropic** isn't a plan: the audio-input feature request is
  open with no public signal of a realtime API. (If that changes, this whole
  memo expires — see triggers.)
- **Gemini Live** trades a brain mismatch for a brain mismatch plus a
  platform migration; the only win is price, which isn't the pain.
- **A hand-rolled LiveKit/Pipecat cascade** is what you build when you need
  maximum control (telephony, multi-agent routing, custom VAD). For a
  solo-maintained app whose voice layer is one feature, it's the most code,
  the most vendors, and the highest odds of landing at the 1.5 s median
  instead of the 500 ms best case.

## Conclusion

**Realtime is still the right default — the practical choice held up.** No
one else offers a tighter full-duplex loop with less to maintain, the
2.x models erased the old intelligence gap, and the same-brain alternative
Bart actually wants (Claude speaking natively) does not exist at any price.
The different-LLM cost is structurally contained because grading stayed
with Claude.

**But the voice-character complaint won't be fixed inside OpenAI's stack** —
we already ship their best voices. When that itch justifies a project, the
credible move is not a cascade; it's a **platform with a bring-your-own-LLM
socket — ElevenLabs Agents or Hume EVI — with Claude served from the F2
backend**. That single move fixes both complaints at once (Claude brain,
premium voice), keeps one vendor owning the speech loop, and would actually
*simplify* the tool story: the CLM handler runs server-side where every F2
tool already lives, retiring the client-mediated tool plumbing. Cost lands
in the same band as Realtime. A pilot = one topic-voice path behind a flag,
graded exams staying exactly as they are.

Ranked: (1) keep Realtime, spend an hour on exam-persona style prompts
(cheap, bounded upside); (2) when motivated, pilot ElevenLabs Agents with
Claude — with Hume EVI as the alternate if the empathic/prosody signals or
pricing read better in practice (vibeceo8 already holds Hume keys);
(3) don't hand-roll a cascade; (4) don't move to Gemini Live.

**Revisit triggers:** Anthropic ships audio in the Messages API or any
realtime endpoint (immediate re-evaluation — it wins outright); Realtime
prices drop sharply (weakens the pilot's cost story); Dodo wants a
signature branded voice (strengthens ElevenLabs).

## Sources

- https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/
- https://www.marktechpost.com/2026/05/08/openai-releases-three-realtime-audio-models-gpt-realtime-2-gpt-realtime-translate-and-gpt-realtime-whisper-in-the-realtime-api/
- https://hackernoon.com/openai-realtime-api-pricing-in-2026-real-world-data-from-4000-measured-sessions
- https://github.com/anthropics/anthropic-sdk-python/issues/1198
- https://techcrunch.com/2026/03/03/claude-code-rolls-out-a-voice-mode-capability/
- https://www.datastudios.org/post/claude-voice-features-explained-current-status-and-upcoming-real-time-updates
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/2-5-flash-live-api
- https://www.reactify-solutions.com/articles/voice-ai-agents-production-2026
- https://www.autointerviewai.com/blog/livekit-vs-pipecat-voice-ai-framework-2026
- https://futureagi.com/blog/how-to-optimize-pipecat-latency-2026/
- https://dev.hume.ai/docs/speech-to-speech-evi/guides/custom-language-model
- https://www.hume.ai/blog/announcing-evi-3-api
- https://www.famulor.io/blog/ai-voice-agent-pricing-2026-what-10-platforms-actually-cost-per-minute
- https://www.open.cx/blog/elevenlabs-voice-agent-review-and-alternatives-2026
