#!/usr/bin/env python3

# Licensed under the Apache License, Version 2.0 or the MIT License.
# SPDX-License-Identifier: Apache-2.0 OR MIT
# Copyright Jon Hillesheim 2026.

"""Read the whole series locally, as one book, always current.

    python3 learning/tools/serve.py

`mkbook.py` binds the nine pages into one document; this serves that document
and rebuilds it on every request. A full build is about 0.15 seconds, which is
under the time it takes a browser to ask, so there is no watcher here and no
build product to go stale. Edit a chapter, press reload, and the page you get
is the chapter you just saved -- or the reason it did not build.

Three things this does that opening the built file directly does not:

  * **It supplies the skeleton the pages deliberately lack.** A chapter carries
    no doctype, no `<head>` and no `<meta charset>`, because the host that
    serves them adds those at publish time. Opened as a bare file a browser
    falls into quirks mode, so margins and line heights are not the ones the
    published book has, and "it looked right locally" stops meaning anything.
    The wrapper below is the published one, so the two agree.

  * **It refuses to serve a book that failed its own gate.** `mkbook.py` runs
    every chapter's assertions against the assembled document and writes
    nothing if one fails. Here that failure becomes the page, rather than
    leaving the last good build on screen and letting a broken edit look fine.

  * **It reloads itself.** The page polls a fingerprint of the sources, which
    costs a `stat` per file and no build at all, and reloads when it moves.
    Scroll position and the chapter you are on both survive, because iterating
    on one figure otherwise means scrolling back to it after every save.

Options:

  --port N        where to listen. Default 8000, and if that is taken it walks
                  up until it finds a free one rather than failing.
  --theme dark    force a theme instead of following the system, the way
  --theme light   `fixture.py --theme` does. Also available per request as
                  `?theme=dark`, so both can be open side by side.
  --no-open       do not open a browser.

Any path that is not the book is served out of `learning/` as an ordinary
file, so the per-chapter pages still work at their own URLs if you want one on
its own.
"""

import argparse
import hashlib
import html as html_module
import os
import subprocess
import sys
import tempfile
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)


# The skeleton the artifact host injects at publish time, reproduced so that a
# local read and a published read are the same document. Two deliberate
# differences: `color-scheme` admits dark here, because locally the system
# preference is the only thing that can pick one, and the theme attribute is
# ours to set. Neither reaches the file on disk or the published page.
SHELL = """<!doctype html><html%(theme)s><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root { color-scheme: light dark; }
body { margin: 0; padding: 0;
  font: 14px -apple-system, BlinkMacSystemFont, sans-serif;
  background: #faf9f5; color: #141413; }
img { max-width: 100%%; }
[hidden]:not([hidden="until-found"]) { display: none !important; }
</style>
</head><body>
%(body)s
<script>
/* Local only. Polls a fingerprint of the sources -- a stat per file, never a
   build -- and reloads when it moves. The book's own router scrolls on load,
   so the scroll restore has to run after it rather than with it. */
(function () {
  "use strict";
  var REV = %(rev)s, KEY = "tock-book-scroll";
  try {
    var at = sessionStorage.getItem(KEY);
    if (at !== null) {
      sessionStorage.removeItem(KEY);
      setTimeout(function () { window.scrollTo(0, parseInt(at, 10) || 0); }, 0);
    }
  } catch (e) {}
  function remember() {
    try { sessionStorage.setItem(KEY, String(window.scrollY)); } catch (e) {}
  }
  setInterval(function () {
    fetch("/rev", { cache: "no-store" })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        if (t.trim() !== REV) { remember(); window.location.reload(); }
      })
      .catch(function () {});
  }, 600);
}());
</script>
</body></html>
"""


FAILED = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>the book did not build</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0; padding: 2.5rem 1.5rem;
  font: 15px/1.6 -apple-system, BlinkMacSystemFont, sans-serif;
  background: #faf9f5; color: #141413; }
main { max-width: 46rem; margin: 0 auto; }
h1 { font-size: 1.4rem; margin: 0 0 .3rem; }
p { color: #5a6068; margin: 0 0 1.4rem; }
pre { background: #fff; border: 1px solid #d8dbdf; border-left: 3px solid #b93a2b;
  padding: 1rem 1.1rem; overflow-x: auto; font-size: 13px; line-height: 1.55;
  white-space: pre-wrap; }
@media (prefers-color-scheme: dark) {
  body { background: #0f1216; color: #e5e8eb; }
  p { color: #98a0a8; }
  pre { background: #161a1f; border-color: #262b31; border-left-color: #e8695c; }
}
</style>
</head><body><main>
<h1>The book did not build</h1>
<p>Nothing was written, so this is the gate talking rather than a stale page.
Fix what it names and this reloads itself.</p>
<pre>%(why)s</pre>
</main>
<script>
(function () {
  var REV = %(rev)s;
  setInterval(function () {
    fetch("/rev", { cache: "no-store" })
      .then(function (r) { return r.text(); })
      .then(function (t) { if (t.trim() !== REV) { window.location.reload(); } })
      .catch(function () {});
  }, 600);
}());
</script>
</body></html>
"""


def sources():
    """Every file whose contents can change the book."""
    out = [os.path.join(ROOT, "index.html"), os.path.join(ROOT, "promises.json")]
    for name in sorted(os.listdir(ROOT)):
        page = os.path.join(ROOT, name, "index.html")
        if name.startswith("ch") and os.path.isfile(page):
            out.append(page)
    tools = os.path.join(ROOT, "tools")
    for name in sorted(os.listdir(tools)):
        if name.endswith(".py") or name.endswith(".js"):
            out.append(os.path.join(tools, name))
    return out


def revision():
    """A fingerprint of the sources: size and mtime, no reading and no build.

    This is what the page polls, so it has to stay cheap enough to run several
    times a second without being noticed.
    """
    digest = hashlib.sha256()
    for path in sources():
        try:
            st = os.stat(path)
            digest.update(("%s:%d:%d\n" % (path, st.st_size, st.st_mtime_ns))
                          .encode("utf-8"))
        except OSError:
            digest.update(("%s:gone\n" % path).encode("utf-8"))
    return digest.hexdigest()[:16]


def build():
    """Run mkbook. Returns (html, None) or (None, why it refused)."""
    handle, path = tempfile.mkstemp(suffix=".html")
    os.close(handle)
    try:
        done = subprocess.run(
            [sys.executable, os.path.join(TOOLS, "mkbook.py"), path],
            capture_output=True, text=True)
        if done.returncode != 0:
            return None, (done.stdout + done.stderr).strip() or "mkbook.py failed"
        with open(path, encoding="utf-8") as fh:
            return fh.read(), None
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        """One line per build, not one per asset and not one per poll."""

    def _send(self, body, kind="text/html; charset=utf-8", code=200):
        raw = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        parts = urlparse(self.path)

        if parts.path == "/rev":
            self._send(revision(), "text/plain; charset=utf-8")
            return

        if parts.path not in ("/", "/index.html", "/book", "/book.html"):
            # Anything else is an ordinary file out of learning/, so a single
            # chapter still reads at its own URL.
            super().do_GET()
            return

        rev = revision()
        page, why = build()
        if why is not None:
            sys.stderr.write("  build failed\n%s\n"
                             % "\n".join("    " + ln for ln in why.splitlines()))
            self._send(FAILED % {"why": html_module.escape(why),
                                 "rev": '"%s"' % rev}, code=500)
            return

        forced = (parse_qs(parts.query).get("theme") or [self.server.theme])[0]
        attr = ' data-theme="%s"' % forced if forced in ("dark", "light") else ""
        self._send(SHELL % {"theme": attr, "body": page, "rev": '"%s"' % rev})
        sys.stderr.write("  built %.2f MB%s\n"
                         % (len(page) / 1048576.0,
                            " (%s)" % forced if attr else ""))


def main(argv):
    ap = argparse.ArgumentParser(
        description="Serve the whole series as one book, rebuilt on request.")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--theme", choices=["dark", "light", "system"],
                    default="system")
    ap.add_argument("--no-open", action="store_true")
    args = ap.parse_args(argv[1:])

    # A build before the first request, so a broken tree is reported here
    # rather than only in a browser.
    page, why = build()
    if why is not None:
        sys.stderr.write("the book does not currently build:\n%s\n" % why)
        sys.stderr.write("serving anyway; the page will show this until it is "
                         "fixed\n")
    else:
        sys.stderr.write("book builds: %.2f MB\n" % (len(page) / 1048576.0))

    port, server = args.port, None
    for port in range(args.port, args.port + 20):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            break
        except OSError:
            continue
    if server is None:
        sys.stderr.write("no free port in %d..%d\n"
                         % (args.port, args.port + 19))
        return 1
    server.theme = args.theme

    url = "http://127.0.0.1:%d/" % port
    sys.stderr.write("\n  %s\n" % url)
    sys.stderr.write("  %s#ch05   deep-links a chapter\n" % url)
    sys.stderr.write("  %s?theme=dark   forces a theme\n\n" % url)
    sys.stderr.write("  edits reload themselves; ctrl-c to stop\n\n")

    if not args.no_open:
        threading.Timer(0.3, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.stderr.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
