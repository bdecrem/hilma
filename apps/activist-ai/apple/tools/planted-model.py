#!/usr/bin/env python3
"""A fake OpenAI-compatible model for the ola-planted check on this Mac (OLA-228, OlaKitTests
LocalPlantedTests). Loopback only, no key checked, made-up data only.

  python3 tools/planted-model.py      prints "port <n>" first, then serves until killed

  POST /v1/chat/completions
    the person's request says "READ-FILE <path>" and no tool has answered yet: the model calls the
      read tool on that path (its argument named from the tool's own schema)
    a tool has answered: the model records every tool result it was given and says "Done."
    anything else (a title, a summary): a short plain reply
  GET /seen    the tool results recorded, as a JSON list of strings
  PLANTED_MODEL_DUMP=<file>   also appends each last tool message, as JSON lines, to <file>
"""
import json, os, re, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOCK = threading.Lock()
SEEN = []


def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(p.get("text", "") for p in content if isinstance(p, dict))
    return json.dumps(content)


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def send(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def stream(self, delta, finish):
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.send_header("transfer-encoding", "chunked")
        self.end_headers()
        base = {"id": "p1", "object": "chat.completion.chunk", "created": int(time.time()), "model": "general"}

        def chunk(obj):
            d = ("data: " + (obj if isinstance(obj, str) else json.dumps(obj)) + "\n\n").encode()
            self.wfile.write(b"%x\r\n%s\r\n" % (len(d), d))
            self.wfile.flush()
        chunk({**base, "choices": [{"index": 0, "delta": {"role": "assistant", **delta}, "finish_reason": None}]})
        chunk({**base, "choices": [{"index": 0, "delta": {}, "finish_reason": finish}],
               "usage": {"prompt_tokens": 5, "completion_tokens": 5, "total_tokens": 10}})
        chunk("[DONE]")
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()

    def do_GET(self):
        if self.path == "/seen":
            with LOCK:
                return self.send(200, list(SEEN))
        if self.path.endswith("/models"):
            return self.send(200, {"object": "list", "data": [{"id": "general", "object": "model"}]})
        return self.send(404, {"error": "not_found"})

    def do_POST(self):
        n = int(self.headers.get("content-length") or 0)
        req = json.loads(self.rfile.read(n) or b"{}")
        if not self.path.endswith("/chat/completions"):
            return self.send(404, {"error": "not_found"})
        msgs = req.get("messages") or []
        tools = {t.get("function", {}).get("name"): t.get("function", {}) for t in req.get("tools") or []}
        results = [text_of(m.get("content")) for m in msgs if m.get("role") == "tool"]
        asked = next((re.search(r"READ-FILE (\S+)", text_of(m.get("content"))) for m in msgs if m.get("role") == "user"
                      and "READ-FILE" in text_of(m.get("content"))), None)
        if not req.get("stream"):
            return self.send(200, {"id": "p0", "object": "chat.completion", "model": "general",
                                   "choices": [{"index": 0, "message": {"role": "assistant", "content": "Planted check"}, "finish_reason": "stop"}],
                                   "usage": {"prompt_tokens": 5, "completion_tokens": 2, "total_tokens": 7}})
        if results:
            if os.environ.get("PLANTED_MODEL_DUMP"):
                with open(os.environ["PLANTED_MODEL_DUMP"], "a") as f:
                    f.write(json.dumps(msgs[-1]) + "\n")
            with LOCK:
                SEEN.extend(results)
            return self.stream({"content": "Done."}, "stop")
        if asked and "read" in tools:
            props = (tools["read"].get("parameters") or {}).get("properties") or {}
            key = next((k for k in ("filePath", "file_path", "path") if k in props), "filePath")
            args = json.dumps({key: asked.group(1)})
            return self.stream({"tool_calls": [{"index": 0, "id": "call_read_1", "type": "function",
                                                "function": {"name": "read", "arguments": args}}]}, "tool_calls")
        return self.stream({"content": "Hello."}, "stop")


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    print("port", srv.server_address[1], flush=True)
    srv.serve_forever()
