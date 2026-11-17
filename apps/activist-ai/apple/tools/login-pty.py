#!/usr/bin/env python3
"""`ola login` in a pseudo-terminal, the way Terminal runs it: waits for "Name:", types the name,
waits for "Password:", types the password (read from a file, never from the command line), and
prints what the terminal showed. Exits 0 only if it said "Signed in as <name>." and the password
never appeared on the screen.

  python3 tools/login-pty.py <name> <password-file> -- <Ola.app>/Contents/MacOS/Ola --cli login
"""
import os, pty, select, sys, time

args = sys.argv[1:]
name, pwfile = args[0], args[1]
cmd = args[args.index("--") + 1:]
password = open(pwfile).read().strip()
pid, fd = pty.fork()
if pid == 0:
    os.execv(cmd[0], cmd)
seen = b""


def read_until(word, timeout=60):
    global seen
    end = time.time() + timeout
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.2)
        if r:
            try:
                chunk = os.read(fd, 4096)
            except OSError:
                return False
            if not chunk:
                return False
            seen += chunk
            if word.encode() in seen:
                return True
    return False


ok = read_until("Name:")
os.write(fd, (name + "\r").encode())
ok = ok and read_until("Password:")
time.sleep(0.2)
os.write(fd, (password + "\r").encode())
read_until("\n", 1)
end = time.time() + 60
while time.time() < end:
    r, _, _ = select.select([fd], [], [], 0.2)
    if r:
        try:
            chunk = os.read(fd, 4096)
        except OSError:
            break
        if not chunk:
            break
        seen += chunk
_, status = os.waitpid(pid, 0)
text = seen.decode(errors="replace").replace("\r\n", "\n").replace("\r", "\n")
shown = password in text
print(text.replace(password, "<the password>") if shown else text, end="" if text.endswith("\n") else "\n")
good = ok and not shown and f"Signed in as {name}." in text
print(f"[exit {os.WEXITSTATUS(status)}; password shown on screen: {'YES' if shown else 'no'}]")
sys.exit(0 if good else 1)
