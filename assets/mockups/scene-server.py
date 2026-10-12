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

    def end_headers(self):
        # Never let the browser cache a source file.
        #
        # Chrome caches heuristically off Last-Modified when no Cache-Control
        # is sent, and headless runs share the default profile — so an edit
        # to src/*.js could be live on disk, served correctly by curl, and
        # still not be the code the page executed. That produced a real
        # false negative here: a feature measured as "not working" against a
        # build from several edits earlier. Every measurement taken through
        # this server has to be a measurement of the working tree.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, *a):
        pass

REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
http.server.ThreadingHTTPServer(
    ("0.0.0.0", 8123),
    functools.partial(Handler, directory=REPO_ROOT),
).serve_forever()
