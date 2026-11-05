"""Serve exactly one in-memory BOM and bundled assets on loopback only."""

from __future__ import annotations

import mimetypes
from pathlib import Path
import re
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

WEB = Path(__file__).parent / "web"
MAX_HTML_BYTES = 100 * 1024 * 1024


def augment_html(source: str, prefix: str) -> bytes:
    if not all(marker in source for marker in ("pcbdata", "bombody", "createRowHighlightHandler")):
        raise ValueError("Choose an InteractiveHtmlBom HTML export (with its BOM table), not a PCB or a generic HTML file.")
    if "bag-bom-root" in source:
        raise ValueError("This file already contains Bag BOM. Open the original InteractiveHtmlBom export.")
    additions = f'''<div id="bag-bom-root" data-assets="{prefix}assets/"></div>
<script src="{prefix}assets/matcher.js"></script>
<script src="{prefix}assets/barcodes.js"></script>
<script src="{prefix}assets/scanner.js"></script>
'''
    # Insert after upstream inline scripts, but before load events fire.
    ends = list(re.finditer(r"</body\s*>", source, re.I))
    if not ends:
        raise ValueError("The HTML export has no closing body tag. Regenerate it with InteractiveHtmlBom.")
    position = ends[-1].start()
    return (source[:position] + additions + source[position:]).encode("utf-8")


class BomSession:
    def __init__(self, html_path, *, web_root=WEB, idle_seconds=180):
        source_path = Path(html_path).resolve(strict=True)
        if source_path.stat().st_size > MAX_HTML_BYTES:
            raise ValueError("BOM HTML exceeds the 100 MiB limit.")
        source = source_path.read_text(encoding="utf-8-sig")
        self.prefix = "/" + secrets.token_urlsafe(24) + "/"
        self.html = augment_html(source, self.prefix)
        self.web_root = Path(web_root).resolve()
        self.idle_seconds = idle_seconds
        self.last_seen = time.monotonic()
        self.running = False
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), self._handler())
        self.httpd.daemon_threads = True
        self.host = f"127.0.0.1:{self.httpd.server_port}"
        self.url = f"http://{self.host}{self.prefix}"

    def _handler(self):
        session = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                if self.headers.get("Host") != session.host:
                    self.send_error(403)
                    return
                origin = self.headers.get("Origin")
                if origin and origin != f"http://{session.host}":
                    self.send_error(403)
                    return
                path = urlsplit(self.path).path
                if not path.startswith(session.prefix):
                    self.send_error(404)
                    return
                relative = path[len(session.prefix):]
                if relative in ("", "index.html"):
                    content, mime = session.html, "text/html; charset=utf-8"
                elif relative == "ping":
                    content, mime = b"ok", "text/plain"
                elif relative.startswith("assets/"):
                    target = (session.web_root / relative[7:]).resolve()
                    if not target.is_relative_to(session.web_root) or not target.is_file():
                        self.send_error(404)
                        return
                    content = target.read_bytes()
                    mime = {
                        ".js": "text/javascript", ".wasm": "application/wasm",
                        ".gz": "application/octet-stream",
                    }.get(target.suffix, mimetypes.guess_type(str(target))[0] or "application/octet-stream")
                else:
                    self.send_error(404)
                    return
                session.last_seen = time.monotonic()
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("Referrer-Policy", "no-referrer")
                self.send_header("Permissions-Policy", "camera=(self), microphone=()")
                self.send_header("Content-Security-Policy", "frame-ancestors 'none'")
                self.end_headers()
                try:
                    self.wfile.write(content)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        return Handler

    def start(self):
        self.running = True
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        threading.Thread(target=self._watchdog, daemon=True).start()
        return self

    def _watchdog(self):
        while self.running:
            time.sleep(2)
            if time.monotonic() - self.last_seen > self.idle_seconds:
                self.close()

    def close(self):
        if self.running:
            self.running = False
            self.httpd.shutdown()
        self.httpd.server_close()

    def __enter__(self):
        return self.start()

    def __exit__(self, *_):
        self.close()
