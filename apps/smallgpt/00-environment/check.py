"""Step 0: is PyTorch installed, and does it see the Apple GPU?

Multiplies two 4096x4096 matrices on the CPU and on the GPU ("mps" = Metal
Performance Shaders, Apple's GPU backend) and times both. The GPU should win
by a wide margin; that is how we know later training runs are on the GPU.
"""

import platform
import time

import torch


def time_matmul(device: str, n: int = 4096, repeats: int = 5) -> float:
    a = torch.randn(n, n, device=device)
    b = torch.randn(n, n, device=device)
    a @ b  # warm-up: the first call on mps compiles the kernel
    if device == "mps":
        torch.mps.synchronize()
    start = time.perf_counter()
    for _ in range(repeats):
        c = a @ b
    if device == "mps":
        torch.mps.synchronize()  # GPU work is asynchronous; wait for it before stopping the clock
    return (time.perf_counter() - start) / repeats


print(f"python  {platform.python_version()} on {platform.machine()}")
print(f"torch   {torch.__version__}")
print(f"mps     available: {torch.backends.mps.is_available()}")

cpu = time_matmul("cpu")
print(f"cpu     4096x4096 matmul: {cpu * 1000:.0f} ms")

if torch.backends.mps.is_available():
    mps = time_matmul("mps")
    print(f"mps     4096x4096 matmul: {mps * 1000:.0f} ms  ({cpu / mps:.1f}x faster than cpu)")
    print("OK: training will run on the GPU.")
else:
    raise SystemExit("mps is not available; training would run on the CPU. Fix this before step 6.")
