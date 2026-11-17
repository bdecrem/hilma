#!/usr/bin/env python3
"""Runs a command in a pseudo-terminal, the way Terminal would, for the `ola` checks.

  pty-check.py [--wait-for TEXT] [--resize] [--keys SEQ] [--kill-parent] [--timeout S] -- cmd ...

Waits until TEXT has been drawn (or 25 s), optionally resizes the terminal (SIGWINCH), then
either sends SEQ (Python escapes, for example '\\x03' for Ctrl-C) or kills the command with
SIGKILL (--kill-parent), and waits for it to end. Prints one line: drawn, resized, how it ended.
Exit 0 when it ended by itself within the timeout after the keys (or after the kill).
"""
import argparse, fcntl, os, pty, select, signal, struct, sys, termios, time

ap = argparse.ArgumentParser()
ap.add_argument("--wait-for", default="")
ap.add_argument("--keys", default="")
ap.add_argument("--resize", action="store_true")
ap.add_argument("--kill-parent", action="store_true")
ap.add_argument("--timeout", type=float, default=20)
ap.add_argument("--log", default="")
ap.add_argument("cmd", nargs=argparse.REMAINDER)
a = ap.parse_args()
cmd = a.cmd[1:] if a.cmd and a.cmd[0] == "--" else a.cmd

pid, fd = pty.fork()
if pid == 0:
    os.environ["TERM"] = "xterm-256color"
    os.execvp(cmd[0], cmd)

fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 30, 100, 0, 0))
out = bytearray()


def pump(seconds, until=b""):
    end = time.time() + seconds
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            try:
                d = os.read(fd, 65536)
            except OSError:
                return False
            if not d:
                return False
            out.extend(d)
            if until and until in out:
                return True
        done, _ = os.waitpid(pid, os.WNOHANG)
        if done:
            return False
    return bool(until) and until in out


drawn = pump(25, a.wait_for.encode()) if a.wait_for else (pump(3) or True)
resized = False
if a.resize:
    before = len(out)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
    os.kill(pid, signal.SIGWINCH)
    pump(2)
    resized = len(out) > before
if a.kill_parent:
    os.kill(pid, signal.SIGKILL)
elif a.keys:
    for k in a.keys.encode().decode("unicode_escape"):
        os.write(fd, k.encode())
        time.sleep(0.4)

end = time.time() + a.timeout
status = None
while time.time() < end:
    try:
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            out.extend(os.read(fd, 65536))
    except OSError:
        pass
    done, st = os.waitpid(pid, os.WNOHANG)
    if done:
        status = st
        break
if status is None:
    os.kill(pid, signal.SIGKILL)
    os.waitpid(pid, 0)
if a.log:
    open(a.log, "wb").write(bytes(out))
how = "still running (killed by the check)" if status is None else (f"exited {os.waitstatus_to_exitcode(status)}" if os.WIFEXITED(status) else f"signal {os.WTERMSIG(status)}")
print(f"drawn={'yes' if drawn else 'no'} resized={'yes' if resized else ('n/a' if not a.resize else 'no')} bytes={len(out)} ended: {how}")
sys.exit(0 if status is not None and (a.kill_parent or os.WIFEXITED(status)) else 1)
