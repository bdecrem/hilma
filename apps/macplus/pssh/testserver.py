#!/usr/bin/env python3
"""Controlled SSH test server for the Plutonix client (host integration test).
Accepts user 'mac' / password 'plutonix', offers an ed25519 host key, and gives
an echoing shell that answers 'whoami' -> 'mac'. Run: python3 testserver.py [port]
"""
import socket, threading, sys, paramiko

HOST_KEY = paramiko.Ed25519Key.from_private_key_file("/tmp/pssh_test_hostkey")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 2222

class Server(paramiko.ServerInterface):
    def __init__(self): self.done = threading.Event()
    def check_auth_password(self, u, p):
        return paramiko.AUTH_SUCCESSFUL if (u == "mac" and p == "plutonix") else paramiko.AUTH_FAILED
    def get_allowed_auths(self, u): return "password"
    def check_channel_request(self, kind, cid):
        return paramiko.OPEN_SUCCEEDED if kind == "session" else paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED
    def check_channel_pty_request(self, *a): return True
    def check_channel_shell_request(self, chan):
        threading.Thread(target=self.shell, args=(chan,), daemon=True).start()
        return True
    def shell(self, chan):
        chan.send(b"plutonix test shell ready\r\n$ ")
        buf = b""
        try:
            while True:
                d = chan.recv(256)
                if not d: break
                chan.send(d)                       # echo like a real pty
                buf += d
                if b"\r" in d or b"\n" in d:
                    line = buf.replace(b"\r", b"").replace(b"\n", b"").strip()
                    if line == b"whoami": chan.send(b"\r\nmac\r\n$ ")
                    elif line == b"exit": chan.send(b"\r\nbye\r\n"); break
                    else: chan.send(b"\r\n$ ")
                    buf = b""
        finally:
            chan.close(); self.done.set()

def handle(client):
    t = paramiko.Transport(client)
    t.add_server_key(HOST_KEY)
    srv = Server()
    try:
        t.start_server(server=srv)
        chan = t.accept(20)
        if chan: srv.done.wait(30)
    except Exception as e:
        print("server error:", e, flush=True)
    finally:
        t.close()

s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", PORT)); s.listen(5)
print(f"test sshd listening on 127.0.0.1:{PORT}", flush=True)
while True:
    cl, _ = s.accept()
    threading.Thread(target=handle, args=(cl,), daemon=True).start()
