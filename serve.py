#!/usr/bin/env python3
"""Zero-dependency static server for local play.

ES modules cannot be loaded over file://, so serve the directory instead:

    python3 serve.py            # http://localhost:8000
    python3 serve.py 9000       # pick a port
"""

import functools
import http.server
import json
import socketserver
import sys
from pathlib import Path

import musicscan

ROOT = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
    }

    def do_GET(self):
        # Generated, never read off disk: dropping files into music/ should be
        # the whole story, and the checked-in manifest goes stale the moment
        # someone adds a track without running `npm run music`.
        if self.path.split("?")[0] == "/music/tracks.json":
            body = json.dumps(musicscan.scan(ROOT / "music")).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        # Always serve fresh files while iterating on patterns.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "--quiet" not in sys.argv:
            super().log_message(fmt, *args)


def main():
    port = 8000
    for arg in sys.argv[1:]:
        if arg.isdigit():
            port = int(arg)

    handler = functools.partial(Handler, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", port), handler) as httpd:
        print(f"Boss Rush running at http://localhost:{port}/")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()
