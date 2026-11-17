#!/usr/bin/python3 -I
# Review 4: a scripted stand-in for Anthropic's Messages API that runs INSIDE a workspace VM on
# 127.0.0.1:<port> (the image has python3 and no node), so rev4.mjs can drive the image's own
# Claude Code under ola-claude without the gateway and without any real credential.
# A main request (its tools list Write) whose first user text says "write <name>" gets one Write of
# /work/<name>, then a one-line answer; everything else gets a short text. Made-up data only.
import http.server, json, re, sys

def text_of(c):
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return " ".join(p.get("text", "") for p in c if isinstance(p, dict) and p.get("type") == "text")
    return ""

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get("content-length") or 0)
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            body = {}
        if self.path.startswith("/v1/messages/count_tokens"):
            return self.reply_json({"input_tokens": 42})
        msgs = body.get("messages") or []
        ask = next((text_of(m.get("content")) for m in msgs if m.get("role") == "user" and text_of(m.get("content")).strip()), "")
        done = [p for m in msgs if m.get("role") == "user" and isinstance(m.get("content"), list) for p in m["content"] if isinstance(p, dict) and p.get("type") == "tool_result"]
        main = any(t.get("name") == "Write" for t in body.get("tools") or [])
        w = re.search(r"write (\S+)", ask)
        tool = None
        text = "Hello from the review stand-in."
        if main and w:
            if not done:
                tool = {"name": "Write", "input": {"file_path": "/work/" + w.group(1), "content": "made-up\n"}}
            else:
                text = "Finished."
        usage = {"input_tokens": 100, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0, "output_tokens": 1}
        if not body.get("stream"):
            content = [{"type": "tool_use", "id": "toolu_r4", "name": tool["name"], "input": tool["input"]}] if tool else [{"type": "text", "text": text}]
            return self.reply_json({"id": "msg_r4", "type": "message", "role": "assistant", "model": body.get("model"), "content": content, "stop_reason": "tool_use" if tool else "end_turn", "usage": usage})
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.end_headers()
        def ev(t, d):
            d = dict(d, type=t)
            self.wfile.write(("event: %s\ndata: %s\n\n" % (t, json.dumps(d))).encode())
        ev("message_start", {"message": {"id": "msg_r4", "type": "message", "role": "assistant", "model": body.get("model"), "content": [], "stop_reason": None, "usage": usage}})
        if tool:
            ev("content_block_start", {"index": 0, "content_block": {"type": "tool_use", "id": "toolu_r4_%d" % len(msgs), "name": tool["name"], "input": {}}})
            ev("content_block_delta", {"index": 0, "delta": {"type": "input_json_delta", "partial_json": json.dumps(tool["input"])}})
        else:
            ev("content_block_start", {"index": 0, "content_block": {"type": "text", "text": ""}})
            ev("content_block_delta", {"index": 0, "delta": {"type": "text_delta", "text": text}})
        ev("content_block_stop", {"index": 0})
        ev("message_delta", {"delta": {"stop_reason": "tool_use" if tool else "end_turn", "stop_sequence": None}, "usage": {"output_tokens": 5}})
        ev("message_stop", {})

    def reply_json(self, obj):
        b = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
