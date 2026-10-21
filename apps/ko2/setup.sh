#!/bin/bash
# One-time setup for apps/ko2: a Python venv with mido + python-rtmidi and a clone of
# kmorrill's ep-series-sysex toolkit (MIT; its docs are copied into manual/sysex/).
# Re-run any time; it is idempotent. Everything it makes is gitignored.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python3 ]; then python3 -m venv .venv; fi
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q mido python-rtmidi
if [ ! -d ext/ep-series-sysex ]; then
  mkdir -p ext
  git clone -q https://github.com/kmorrill/ep-series-sysex ext/ep-series-sysex
fi
.venv/bin/pip install -q -e ext/ep-series-sysex
.venv/bin/python3 -c "import mido, epsysex; print('ko2 venv ok:', mido.get_output_names())"
