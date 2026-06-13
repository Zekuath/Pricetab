# Static file server for the repo + /__delay endpoint that stalls the page
# load event so headless Chrome screenshots after animations settle.
# Usage: python3 assets/mockups/scene-server.py  (serves the repo on :8123)
import http.server, os, time, functools

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/__delay"):
            ms = int(self.path.split("ms=")[1]) if "ms=" in self.path else 5000
            time.sleep(ms / 1000)
            gif = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
            self.send_response(200)
            self.send_header("Content-Type", "image/gif")
            self.send_header("Content-Length", str(len(gif)))
            self.end_headers()
            self.wfile.write(gif)
            return
        super().do_GET()

    def log_message(self, *a):
        pass

REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
http.server.ThreadingHTTPServer(
    ("0.0.0.0", 8123),
    functools.partial(Handler, directory=REPO_ROOT),
).serve_forever()
