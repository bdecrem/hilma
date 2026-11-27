# ola-examples

## 1.3.0 (2026-11-27, OLA-497)

The note no longer shows how each thing was tried: it says to build in one go as AGENTS.md says and hand it over without a look. The library's examples are rewritten to that fast path (one .html file where it can; a part that computes in its own .js with its cases run once by ola-test; no designer skill). The speed check (evals/speed) measured Ola writing kite.html, kite.css and kite.js and looking at the page where plain OpenCode wrote one file.

## 1.2.0 (2026-11-21, OLA-181)

Examples stay inside their own project: image 2.3.2-62 sets OLA_EXAMPLES_EXTRA=/work/.ola/examples.json, the project's own requests that ended well (written by the front desk with `ola-db examples`), shown "(from this project)". The shared file of Bart's kept requests, shown in every project, is gone. The note is fenced ([Ola worked example] ... [end of the worked example]) and at most 2400 characters, so the gateway can count it and, with GATEWAY_EXAMPLES=off, cut it out everywhere.

## 1.1.0 (2026-11-21, OLA-181)

The OLA_EXAMPLES_EXTRA files are read again when one changes (size or time), so a new kept example of Bart's, or his deleted ones, reach a running VM at its next request. Image 2.3.0-59 sets OLA_EXAMPLES_EXTRA=/ola/examples/kept.json.

## 1.0.0 (2026-11-21, OLA-181)

First version: the closest worked example (examples.json, eight test requests) goes into the system prompt for a request to make an app, page or game; BM25 word overlap, threshold 2.5; OLA_EXAMPLES=off, OLA_EXAMPLES_FILE, OLA_EXAMPLES_EXTRA.
