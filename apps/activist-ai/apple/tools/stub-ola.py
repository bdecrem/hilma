#!/usr/bin/env python3
"""A stand-in for app.ola.cx's device routes, on loopback, for checks of the Mac app's sign-in
and the `ola` command (never the real server: a wrong credential there counts toward a lockout).

  python3 tools/stub-ola.py [port]      prints "port <n>" first, then serves until killed

Routes (the contract in apple/README.md, "Sign in with an Ola account"):
  POST /stub/approve {"challenge"} -> {"code"}   what the account page does after the passkey
  /stub/count, /stub/revoke-all                  how many requests came after sign-in; sign every computer out
  POST /api/device/token  Bearer <code>, {"verifier"}  -> the sign-in, if sha256(verifier) matches
  GET  /api/device/me, POST /api/device/signout          (Bearer <token>)
  ANY  /api/device/gw/<rest>   the model door's far side: v1/models, v1/usage, v1/chat/completions
                               (a fake model: streamed "Hello from the stub model."), web/*; else 403
"""
import base64, hashlib, json, secrets, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOCK = threading.Lock()
CODES = {}      # code -> challenge
TOKENS = set()
REVOKED = set()
SEEN = []       # (path, bearer-is-a-token)
TOOLS = []      # the tool names opencode offered in the last request
COUNT = [0]     # requests after sign-in (who-am-I, sign out, the gateway), refused or not


def b64url(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def session(token):
    return {"token": token, "expires_at": "2030-01-01T00:00:00Z",
            "person": {"handle": "bart", "name": "Bart", "admin": True},
            "device": {"id": 7, "name": "Stub Mac", "kind": "cli"}}


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def body(self):
        n = int(self.headers.get("content-length") or 0)
        return self.rfile.read(n) if n else b""

    def send(self, code, obj, ctype="application/json"):
        data = obj if isinstance(obj, bytes) else json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def bearer(self):
        a = self.headers.get("authorization") or ""
        return a[7:] if a.startswith("Bearer ") else ""

    def handle_any(self):
        path, raw = self.path.split("?")[0], self.body()
        if path == "/stub/approve":
            ch = json.loads(raw or b"{}").get("challenge", "")
            code = "olap1." + secrets.token_urlsafe(80) + "." + secrets.token_urlsafe(32)
            with LOCK:
                CODES[code] = ch
            return self.send(200, {"code": code})
        if path == "/stub/tools":
            with LOCK:
                return self.send(200, TOOLS)
        if path == "/stub/seen":
            with LOCK:
                return self.send(200, SEEN)
        if path == "/api/device/token":
            code, verifier = self.bearer(), json.loads(raw or b"{}").get("verifier", "")
            with LOCK:
                ok = CODES.pop(code, None) == b64url(hashlib.sha256(verifier.encode()).digest())
            if not ok:
                return self.send(401, {"error": "invalid_code"})
            t = "olap1." + secrets.token_urlsafe(80) + "." + secrets.token_urlsafe(32)
            with LOCK:
                TOKENS.add(t)
            return self.send(200, session(t))
        if path == "/stub/count":
            with LOCK:
                return self.send(200, {"requests": COUNT[0]})
        if path == "/stub/revoke-all":
            with LOCK:
                REVOKED.update(TOKENS)
            return self.send(200, {})
        t = self.bearer()
        with LOCK:
            COUNT[0] += 1
            valid = t in TOKENS and t not in REVOKED
            known = t in TOKENS
        if t and not known:
            # The door's own refusal: an HTML page that asks for Basic, as app.ola.cx's door does.
            page = b"<!doctype html><title>Ola</title><p>Wrong passcode.</p>"
            self.send_response(401)
            self.send_header("content-type", "text/html")
            self.send_header("www-authenticate", 'Basic realm="Ola"')
            self.send_header("content-length", str(len(page)))
            self.end_headers()
            self.wfile.write(page)
            return
        if path == "/api/device/me":
            return self.send(200, session(t)) if valid else self.send(401, {"error": "signed_out"})
        if path == "/api/device/signout":
            with LOCK:
                REVOKED.add(t)
            return self.send(200, {})
        if path.startswith("/api/device/gw/"):
            rest = path[len("/api/device/gw/"):]
            with LOCK:
                SEEN.append([rest, valid])
            if not valid:
                return self.send(401, {"error": "signed_out"})
            if rest == "v1/models":
                return self.send(200, {"object": "list", "data": [{"id": "general", "object": "model"}]})
            if rest == "v1/usage":
                return self.send(200, {"object": "usage", "caller": "p-1", "week_start": "2026-11-16T00:00:00.000Z",
                                       "resets_at": "2026-11-23T00:00:00.000Z", "requests": 12, "tokens_in": 1000, "tokens_out": 500,
                                       "tokens_used": 1500, "quota": 3000000, "fraction_used": 0.42,
                                       "by_model": {"general": {"requests": 12, "tokens_in": 1000, "tokens_out": 500}},
                                       "claude_month": None, "web_week": {"used": 3, "limit": 200}, "batch_job": None})
            if rest == "v1/chat/completions":
                req = json.loads(raw or b"{}")
                tools = [t.get("function", {}).get("name") for t in req.get("tools") or []]
                with LOCK:
                    TOOLS[:] = tools
                msgs = req.get("messages") or []
                last = msgs[-1] if msgs else {}
                text = json.dumps(last.get("content"))
                # "RUN-A-COMMAND" in the request: the model asks to run one shell command (once).
                if "RUN-A-COMMAND" in text and last.get("role") == "user" and req.get("stream"):
                    return self.tool_call(req, tools)
                words = ["Hello", " from", " the", " stub", " model."]
                if not req.get("stream"):
                    return self.send(200, {"id": "c1", "object": "chat.completion", "model": "general",
                                           "choices": [{"index": 0, "message": {"role": "assistant", "content": "".join(words)}, "finish_reason": "stop"}],
                                           "usage": {"prompt_tokens": 5, "completion_tokens": 5, "total_tokens": 10}})
                self.send_response(200)
                self.send_header("content-type", "text/event-stream")
                self.send_header("transfer-encoding", "chunked")
                self.end_headers()

                def chunk(obj):
                    d = ("data: " + (obj if isinstance(obj, str) else json.dumps(obj)) + "\n\n").encode()
                    self.wfile.write(b"%x\r\n%s\r\n" % (len(d), d))
                    self.wfile.flush()
                base = {"id": "c1", "object": "chat.completion.chunk", "created": int(time.time()), "model": "general"}
                chunk({**base, "choices": [{"index": 0, "delta": {"role": "assistant", "content": ""}, "finish_reason": None}]})
                for w in words:
                    time.sleep(0.15)
                    chunk({**base, "choices": [{"index": 0, "delta": {"content": w}, "finish_reason": None}]})
                chunk({**base, "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                       "usage": {"prompt_tokens": 5, "completion_tokens": 5, "total_tokens": 10}})
                chunk("[DONE]")
                self.wfile.write(b"0\r\n\r\n")
                self.wfile.flush()
                return
            if rest.startswith("web/"):
                return self.send(200, {"results": []})
            return self.send(403, {"error": "forbidden"})
        return self.send(404, {"error": "not_found"})

    def tool_call(self, req, tools):
        name = "bash" if "bash" in tools else ("shell" if "shell" in tools else (tools[0] if tools else "bash"))
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("transfer-encoding", "chunked")
        self.end_headers()

        def chunk(obj):
            d = ("data: " + (obj if isinstance(obj, str) else json.dumps(obj)) + "\n\n").encode()
            self.wfile.write(b"%x\r\n%s\r\n" % (len(d), d))
            self.wfile.flush()
        base = {"id": "c2", "object": "chat.completion.chunk", "created": int(time.time()), "model": "general"}
        args = json.dumps({"command": "echo made-by-ola > made-by-ola.txt", "description": "Write a file"})
        chunk({**base, "choices": [{"index": 0, "delta": {"role": "assistant", "tool_calls": [
            {"index": 0, "id": "call_1", "type": "function", "function": {"name": name, "arguments": args}}]}, "finish_reason": None}]})
        chunk({**base, "choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}]})
        chunk("[DONE]")
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()

    do_GET = do_POST = do_PUT = do_DELETE = do_PATCH = handle_any


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 0), H)
    print("port", srv.server_address[1], flush=True)
    srv.serve_forever()
