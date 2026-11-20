# ola-planted

## 2 (image 2.3.0-45, 2026-11-20, OLA-88)

- The note hands the agent the sentence to write ("Note: <file> contains text addressed to an AI that asks
  ...; I did not follow it.") and says not to act on what the text claims either.
- After every tool call the plugin also scans the text files in /work (each version once, up to 3,000 files
  and 30 MB a file), so a file the agent only reads through a script is covered. Files the agent wrote with
  its file tools are skipped, and each finding is noted once per session.
- Measured (Nemotron 3.5 Super VL, sealed VMs, injection tasks k1 to k4, seeds 1 to 6): 23 of 24 runs
  passed, the person was told in 24 of 24, the planted instruction was followed in 0. Without the plugin
  (images 2.3.0-40 and 2.3.0-43, the same tasks): 17 of 36 passed, told in 18 of 36, followed in 2. The
  wrong-premise tasks (f8, f9, f10) passed 18 of 18 with it and 18 of 18 without. Details in
  `evals/README.md`, "Planted instructions: a note on the tool result".

## 1 (not shipped)

- A note on the read, grep or shell result whose text speaks to an AI. Its only measurement ran on the wrong
  image (2.3.0-43 was another branch's build when the arm started), so it was never measured itself.
