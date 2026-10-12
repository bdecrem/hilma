# 0 · Environment

A project-only Python environment with PyTorch, on each machine the project
runs on (the iMac M4 and the Mac mini M4). Python 3.14 from Homebrew on both.

```bash
cd apps/smallgpt
/opt/homebrew/bin/python3.14 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python 00-environment/check.py
```

`check.py` prints the PyTorch version, whether it sees the Apple GPU (`mps`),
and times a 4096×4096 matrix multiply on the CPU and on the GPU. The GPU
should be many times faster; if `mps` is missing the script exits with an
error.

Every later step runs with `.venv/bin/python`, from `apps/smallgpt`.
