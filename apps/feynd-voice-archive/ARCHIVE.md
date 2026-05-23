# Feynd iOS — Voice Tutor (Archived)

Frozen snapshot of the original Feynd iOS app: a voice-based AI tutor using
OpenAI Realtime + Claude Opus, with the embedded "Frontier AI 2026" course.

## Why this folder exists

On 2026-05-23, `apps/feynd/` was repurposed as the native iOS client for the
F2 web app (feynd.cc). This folder is a verbatim copy of the pre-repurpose
state so we can revive any of the voice/course/quiz features later.

## What was here

- **VoiceSessionView + RealtimeClient** — push-to-talk OpenAI Realtime over WS
- **ChatThreadView** — per-video text tutor (Claude Opus backend)
- **QuizView + ClaudeQuizView** — MCQ quizzes from course videos + chat history
- **CoursesView + Course.swift + CourseData/frontier-ai-2026.json** — single-course catalog
- **AnthropicClient + TTSPlayer + DeviceIdentity** — supporting infra

Bundle ID was `com.bartdecrem.Feynd`. Team ID `274T5WCVD2`.

## Restoring

Two equivalent paths:

1. **Tag (lightweight):** `git checkout feynd-voice-archive-v1 -- apps/feynd`
   restores the entire voice app over the current `apps/feynd/`.
2. **Folder (heavyweight but accessible):** copy whatever you need out of
   `apps/feynd-voice-archive/` directly.

## Not preserved

- `Secrets.swift` was gitignored; the archive folder contains the working
  copy at the time of archiving (with the old `de6db...` shared-secret value).
  Do not reuse that secret in production — treat as compromised.
