#!/usr/bin/env python3
"""Run a command in a pseudo-terminal, keep its output in a log, and answer the
Claude fallback's approval questions with "a" (Always allow, for this run).

The Claude fallback in `Ola --cli` asks before each write or command and says no
when there is no terminal; Bart, at his Mac, would say yes. Only the
"[o] Allow once  [a] Always allow  [r] Reject:" question is answered; any other
question ends the run's input (EOF), which the CLI treats as "no".

usage: pty-run.py <log file> <seconds> -- command args...
exit code: the command's, or 124 on the time limit.
"""
import os, pty, select, signal, sys, time

log_path, limit = sys.argv[1], float(sys.argv[2])
cmd = sys.argv[sys.argv.index("--") + 1:]
pid, fd = pty.fork()
if pid == 0:
    os.execvp(cmd[0], cmd)

start = time.time()
tail = b""
answered = 0
with open(log_path, "ab") as log:
    while True:
        if time.time() - start > limit:
            os.kill(pid, signal.SIGINT)
            time.sleep(3)
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            os.waitpid(pid, 0)
            log.write(b"\n[pty-run] time limit\n")
            sys.exit(124)
        r, _, _ = select.select([fd], [], [], 1.0)
        if fd in r:
            try:
                data = os.read(fd, 65536)
            except OSError:
                data = b""
            if not data:
                break
            log.write(data)
            log.flush()
            tail = (tail + data)[-400:]
            if b"[r] Reject:" in tail:
                os.write(fd, b"a\n")
                answered += 1
                tail = b""
        else:
            done, status = os.waitpid(pid, os.WNOHANG)
            if done:
                log.write(f"\n[pty-run] answered {answered} questions\n".encode())
                sys.exit(os.waitstatus_to_exitcode(status))
    _, status = os.waitpid(pid, 0)
    log.write(f"\n[pty-run] answered {answered} questions\n".encode())
    sys.exit(os.waitstatus_to_exitcode(status))
