#!/usr/bin/env python3
"""NeoCloud 콘솔 정적 서버 (:8090).

plain `http.server` 대신 사용 — Cache-Control: no-cache를 보내
브라우저가 항상 재검증하도록 한다 (개발 중 옛 app.js 캐시로
화면이 통째로 죽는 문제 방지).

    python3 serve.py [port]
"""
import http.server
import sys
from pathlib import Path


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *a):          # 콘솔 소음 억제
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    root = Path(__file__).parent

    class Handler(NoCacheHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(root), **kw)

    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
