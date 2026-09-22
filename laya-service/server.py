#!/usr/bin/env python3
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# pyrefly: ignore [missing-import]
from laya import Router

PORT = int(os.environ.get("PORT", "8080"))
DEVICE = os.environ.get("LAYA_DEVICE", "cpu")
MODEL = os.environ.get("LAYA_MODEL", "multilingual")
MAX_BODY = 4 * 1024 * 1024

_router = None
_load_ms = None


def router():
    global _router, _load_ms
    if _router is None:
        started = time.perf_counter()
        _router = Router(device=DEVICE)
        _router.predict(
            state="warmup",
            questions={"w": {"type": "noul", "instructions": "Is this a warmup?"}},
            model=MODEL,
        )
        _load_ms = round((time.perf_counter() - started) * 1000)
    return _router


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}", flush=True)

    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/health":
            self._send(404, {"error": "not found"})
            return
        ready = _router is not None
        self._send(200, {"ok": True, "device": DEVICE, "loaded": ready, "load_ms": _load_ms})

    def do_POST(self):
        if self.path != "/predict":
            self._send(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            self._send(413, {"error": f"body must be 1..{MAX_BODY} bytes"})
            return

        try:
            request = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            self._send(400, {"error": f"invalid json: {error}"})
            return

        state = request.get("state")
        questions = request.get("questions")
        if state is None or not isinstance(questions, dict) or not questions:
            self._send(400, {"error": "need 'state' and a non-empty 'questions' object"})
            return

        model = request.get("model", MODEL)
        started = time.perf_counter()
        try:
            result = router().predict(state=state, questions=questions, model=model)
        except Exception as error:
            self._send(500, {"error": f"{type(error).__name__}: {error}"})
            return

        self._send(
            200,
            {
                "result": result,
                "elapsed_ms": round((time.perf_counter() - started) * 1000, 1),
                "device": DEVICE,
                "model": model,
            },
        )


def main():
    router()
    print(f"laya-service on :{PORT} device={DEVICE} model={MODEL} load_ms={_load_ms}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
