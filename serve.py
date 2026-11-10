#!/usr/bin/env python3
"""NeoCloud 콘솔 정적 서버 (:8090).

plain `http.server` 대신 사용 — Cache-Control: no-cache를 보내
브라우저가 항상 재검증하도록 한다 (개발 중 옛 app.js 캐시로
화면이 통째로 죽는 문제 방지).

보안 (fix(security)):
- 기본 바인드 127.0.0.1 (CONSOLE_HOST=0.0.0.0 으로 명시해야 외부 노출)
- 콘솔 자산만 서빙: 허용 최상위 경로 + 허용 확장자, dotfile(.git 등)·.py·.zip 차단
- 루트 밖으로 나가는 경로(.., 심볼릭 링크) 차단, 디렉터리 목록 비활성
- nosniff / frame-ancestors / Referrer-Policy 헤더

    python3 serve.py [port]
"""
import http.server
import os
import posixpath
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
ALLOWED_TOP = {"index.html", "ops-console.html", "ops", "customer", "biz", "shared"}
ALLOWED_EXT = {".html", ".js", ".css", ".json", ".svg", ".png", ".jpg", ".jpeg",
               ".gif", ".ico", ".woff", ".woff2", ".ttf", ".map", ".txt", ".webp"}
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
}


def resolve_request(url_path: str, root: Path = ROOT):
    """Map a request path to a file under root, or None when it must be refused."""
    path = unquote(urlsplit(url_path).path)
    if "\x00" in path or "\\" in path:
        return None
    norm = posixpath.normpath("/" + path.lstrip("/"))
    parts = [p for p in norm.split("/") if p]
    if not parts:
        parts = ["index.html"]
    if any(p.startswith(".") for p in parts) or parts[0] not in ALLOWED_TOP:
        return None
    target = root.joinpath(*parts)
    try:
        real = target.resolve(strict=True)
    except (OSError, RuntimeError):
        return None
    if root not in real.parents and real != root:
        return None
    if real.is_dir():
        # the base handler redirects /ops → /ops/ and serves its index.html
        return real if (real / "index.html").is_file() else None
    if real.suffix.lower() not in ALLOWED_EXT:
        return None
    return real


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        for k, v in SECURITY_HEADERS.items():
            self.send_header(k, v)
        super().end_headers()

    def translate_path(self, path):
        real = resolve_request(path, Path(self.directory).resolve())
        # a path that cannot exist → SimpleHTTPRequestHandler answers 404
        return str(real) if real else str(Path(self.directory) / ".refused" / "404")

    def list_directory(self, path):          # no directory listings
        self.send_error(404, "Not found")
        return None

    def log_message(self, *a):          # 콘솔 소음 억제
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
    host = os.environ.get("CONSOLE_HOST", "127.0.0.1")

    class Handler(NoCacheHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(ROOT), **kw)

    http.server.ThreadingHTTPServer((host, port), Handler).serve_forever()
