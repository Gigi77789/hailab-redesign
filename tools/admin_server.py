"""Serves the built site with the site editor (admin.html) in local test mode: saves write files here
instead of GitHub, and the site is rebuilt after each save.

    npm run build && python3 tools/admin_server.py     # http://127.0.0.1:8790/admin.html
    python3 tools/admin_server.py DIR 8791              # another copy of the repository, another port

Only the editor's data files (src/data/team.yaml, news.yaml, papers.bib) and images under public/assets/
can be written."""
import base64
import functools
import http.server
import json
import pathlib
import re
import subprocess
import sys
import urllib.parse

ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent.parent).resolve()
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8790
WRITABLE = re.compile(r"^(src/data/(team|news)\.yaml|src/data/papers\.bib|public/assets/(team|papers|culture)/[A-Za-z0-9._-]+\.(jpg|jpeg|png))$")


class Handler(http.server.SimpleHTTPRequestHandler):
    def _send(self, code, body, ctype="text/plain; charset=utf-8"):
        data = body.encode() if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/__admin/ping":
            return self._send(200, json.dumps({"ok": True}), "application/json")
        if u.path == "/__admin/file":
            path = urllib.parse.parse_qs(u.query).get("path", [""])[0]
            if not WRITABLE.match(path) or not (ROOT / path).exists():
                return self._send(404, f"No such data file: {path}")
            return self._send(200, (ROOT / path).read_text())
        return super().do_GET()

    def do_POST(self):
        if self.path != "/__admin/commit":
            return self._send(404, "Not found")
        req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        for f in req["files"]:
            if not WRITABLE.match(f["path"]):
                return self._send(400, f"The editor may not write {f['path']}")
        for f in req["files"]:
            target = ROOT / f["path"]
            if f.get("remove"):
                target.unlink(missing_ok=True)
            elif "base64" in f:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(base64.b64decode(f["base64"]))
            else:
                target.write_text(f["text"])
        # rebuild, so the site here shows the change; a data file the build rejects is reported to the editor
        build = subprocess.run(["npx", "astro", "build"], cwd=ROOT, capture_output=True, text=True)
        print("saved:", req["message"].splitlines()[0], "->", ", ".join(f["path"] for f in req["files"]), flush=True)
        if build.returncode:
            return self._send(500, "Saved, but the site no longer builds:\n" + (build.stderr or build.stdout)[-2000:])
        return self._send(200, "ok")


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=str(ROOT / "dist"))
    print(f"Site editor (local test mode): http://127.0.0.1:{PORT}/admin.html  site: http://127.0.0.1:{PORT}/  files: {ROOT}", flush=True)
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler).serve_forever()
