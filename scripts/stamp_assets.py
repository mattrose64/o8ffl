#!/usr/bin/env python3
"""
Cache-bust the site's CSS and JS.

GitHub Pages serves assets with a ten-minute cache, and browsers hold ES modules longer
than that. Appending a content hash to every asset URL means a push is picked up straight
away instead of leaving league members on a stale bundle.

Run this after changing anything in assets/ (the data files are fetched no-cache, so they
never need it).

Usage:  python3 scripts/stamp_assets.py
"""

import glob
import hashlib
import io
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    assets = sorted(glob.glob(os.path.join(ROOT, "assets", "js", "*.js"))) + [
        os.path.join(ROOT, "assets", "css", "site.css")
    ]
    # Hash the files with any previous stamp stripped out, otherwise stamping changes the
    # content, which changes the hash, which needs another stamp — it never settles.
    digest = hashlib.sha1()
    for path in assets:
        with open(path, "rb") as fh:
            digest.update(re.sub(rb"\?v=[a-f0-9]+", b"", fh.read()))
    stamp = digest.hexdigest()[:8]

    touched = 0
    for path in glob.glob(os.path.join(ROOT, "*.html")):
        text = io.open(path, encoding="utf-8").read()
        before = text
        text = re.sub(r'(href="assets/css/site\.css)(\?v=[a-f0-9]+)?"', rf"\1?v={stamp}\"", text)
        text = re.sub(r'(src="assets/js/[a-z-]+\.js)(\?v=[a-f0-9]+)?"', rf"\1?v={stamp}\"", text)
        if text != before:
            io.open(path, "w", encoding="utf-8").write(text)
            touched += 1

    # The page modules import the shared runtime directly, so that URL needs the stamp too.
    for path in glob.glob(os.path.join(ROOT, "assets", "js", "page-*.js")):
        text = io.open(path, encoding="utf-8").read()
        before = text
        text = re.sub(r'from "\./app\.js(\?v=[a-f0-9]+)?"', f'from "./app.js?v={stamp}"', text)
        if text != before:
            io.open(path, "w", encoding="utf-8").write(text)
            touched += 1

    print(f"stamped {touched} file(s) with v={stamp}")


if __name__ == "__main__":
    main()
