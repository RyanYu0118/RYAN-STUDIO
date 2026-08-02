#!/usr/bin/env python3
"""本地 slug 索引重建服务：后台发布 / 红链创建后自动写 wiki-slugs.json（仅 localhost 开发用）。"""
from __future__ import annotations

import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXPORT = ROOT / "tools" / "mcwws-halo-preview" / "export-wiki-slugs.py"
HOST = "127.0.0.1"
PORT = 8765


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[slug-index-rebuild] " + (fmt % args) + "\n")

    def do_POST(self) -> None:  # noqa: N802
        if self.path not in ("/rebuild", "/"):
            self.send_error(404)
            return
        try:
            proc = subprocess.run(
                [sys.executable, str(EXPORT), "--halo-url", "http://localhost:8090"],
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
            body = (proc.stdout or "") + (proc.stderr or "")
            ok = proc.returncode == 0
            self.send_response(200 if ok else 500)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(body.encode("utf-8"))
        except Exception as e:
            self.send_error(500, str(e))

    def do_GET(self) -> None:  # noqa: N802
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"RS Wiki slug index rebuild server OK\n")


def main() -> int:
    httpd = HTTPServer((HOST, PORT), Handler)
    print(f"Listening http://{HOST}:{PORT}/rebuild  (POST triggers export-wiki-slugs.py)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
