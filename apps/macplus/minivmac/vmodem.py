#!/usr/bin/env python3
"""
vmodem - a virtual Hayes modem for testing the Macinclaude apps in Mini vMac.

The other half of the Mini vMac serial bridge (see SCCEMDEV serial patch + the
README in this folder). The patched Mini vMac exposes the emulated Mac's modem
port as a TCP client socket that connects here. This program is the "modem" on
the far end of that cable:

  patched Mini vMac  --TCP(127.0.0.1:5454)-->  vmodem  --TCP-->  Mac mini listener

It speaks just enough of the Hayes AT command set for the apps' connect ritual:
  AT            -> OK
  ATDT"h:p"     -> dials TCP to host h port p; CONNECT on success, then relays
                   raw bytes both ways (the live session); NO CARRIER on failure
  +++ / ATH     -> drop the call, back to command mode (NO CARRIER)
  any other AT  -> OK   (so ATW/AT&W/ATZ etc. are harmless no-ops)

So the real, unmodified apps run their full modem handshake inside the emulator
and reach the Mac mini's agent listeners (Code :2324, Paint :2325).

Usage:
  python3 vmodem.py [listen_port]      # default 5454; point MNVM_SERIAL at it
"""
import os
import re
import select
import socket
import sys
import time

LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5454

CR = b"\r"


def log(msg):
    print(f"[vmodem] {msg}", flush=True)


def reply(conn, s):
    try:
        conn.sendall(("\r\n" + s + "\r\n").encode("latin-1"))
    except OSError:
        pass


def dial(conn, target):
    """target like '192.168.7.50:2324' (quotes already stripped)."""
    m = re.match(r"\[?([^\]:]+)\]?:(\d+)$", target.strip())
    if not m:
        log(f"bad dial target: {target!r}")
        reply(conn, "NO CARRIER")
        return
    host, port = m.group(1), int(m.group(2))
    # Test convenience: MNVM_REDIRECT=host:port reroutes every dial there, so an
    # unchanged Plus app (whose saved prefs point at the mini) can reach an agent
    # running elsewhere (e.g. Foundry on the iMac) without editing the dialog.
    redir = os.environ.get("MNVM_REDIRECT")
    if redir:
        rh, _, rp = redir.partition(":")
        host, port = rh, int(rp or port)
        log(f"redirecting dial -> {host}:{port}")
    log(f"dialing {host}:{port} ...")
    try:
        mini = socket.create_connection((host, port), timeout=8)
    except OSError as e:
        log(f"dial failed: {e}")
        reply(conn, "NO CARRIER")
        return
    log(f"CONNECT {host}:{port}")
    reply(conn, "CONNECT 9600")
    data_mode(conn, mini)
    try:
        mini.close()
    except OSError:
        pass
    reply(conn, "NO CARRIER")
    log("call ended")


# Optional: throttle the Mac->mini (uplink) direction to mimic the real RetroWiFi
# modem, whose WiFi uplink is far slower than the localhost relay. Set
# MNVM_UPLINK_BPS=160 (say) to reproduce the slow-link screen-grab path.
UPLINK_BPS = int(os.environ.get("MNVM_UPLINK_BPS", "0"))  # 0 = unlimited


def data_mode(conn, mini):
    """Relay raw bytes both ways until either side hangs up. '+++' from the
    Mac side returns to command mode (mirrors the apps' Disconnect)."""
    conn.setblocking(False)
    mini.setblocking(False)
    while True:
        try:
            r, _, _ = select.select([conn, mini], [], [], 1.0)
        except (OSError, ValueError):
            return
        if conn in r:
            try:
                d = conn.recv(2048)
            except BlockingIOError:
                d = None
            except OSError:
                return
            if d == b"":
                return  # emulator closed the cable
            if d:
                if b"+++" in d:
                    pre = d.split(b"+++", 1)[0]
                    if pre:
                        try:
                            mini.sendall(pre)
                        except OSError:
                            pass
                    log("+++ escape -> command mode")
                    conn.setblocking(True)
                    return
                try:
                    mini.sendall(d)
                    if UPLINK_BPS > 0:
                        time.sleep(len(d) / UPLINK_BPS)   # pace the uplink like the real modem
                except OSError:
                    return
        if mini in r:
            try:
                d = mini.recv(2048)
            except BlockingIOError:
                d = None
            except OSError:
                return
            if d == b"":
                return  # mini hung up
            if d:
                try:
                    conn.sendall(d)
                except OSError:
                    return


def handle(conn):
    conn.setblocking(True)
    buf = b""
    while True:
        try:
            data = conn.recv(256)
        except OSError:
            return
        if not data:
            return
        buf += data
        while CR in buf:
            line, buf = buf.split(CR, 1)
            cmd = line.strip().decode("latin-1", "ignore").strip()
            if not cmd:
                continue
            up = cmd.upper()
            if not up.startswith("AT"):
                continue
            log(f"cmd: {cmd!r}")
            if up.startswith("ATD"):
                target = cmd[3:].lstrip("TPtp").strip().strip('"').strip()
                dial(conn, target)
                buf = b""  # discard anything typed before CONNECT
            else:
                reply(conn, "OK")


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((LISTEN_HOST, LISTEN_PORT))
    srv.listen(1)
    log(f"listening on {LISTEN_HOST}:{LISTEN_PORT} (set MNVM_SERIAL to this)")
    while True:
        conn, addr = srv.accept()
        log(f"emulator connected from {addr}")
        try:
            handle(conn)
        finally:
            try:
                conn.close()
            except OSError:
                pass
            log("emulator disconnected")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
