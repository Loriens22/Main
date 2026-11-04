#!/usr/bin/env python3
"""Package dist/ as a claude.ai Artifact: page fragment + supporting-file list.

The artifact host wraps the page in its own <html>/<head>/<body>, so this keeps
only the title/meta/style, the page markup and the module script, and writes
artifact/files.json mapping published paths -> local files (batched <60 MB).
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DIST = os.path.join(ROOT, 'dist')
OUT = os.path.join(ROOT, 'artifact')
os.makedirs(OUT, exist_ok=True)

html = open(os.path.join(DIST, 'index.html'), encoding='utf-8').read()
head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
keep = []
keep.append(re.search(r'<title>.*?</title>', head, re.S).group(0))
keep += re.findall(r'<meta name="claude:[^>]*>', head)
keep += re.findall(r'<style>.*?</style>', head, re.S)
keep += [l.replace(' crossorigin', '') for l in re.findall(r'<link rel="stylesheet"[^>]*>', head)]
scripts = [s.replace(' crossorigin', '') for s in re.findall(r'<script type="module"[^>]*></script>', head)]
body = re.sub(r'<script type="module"[^>]*></script>', '', body)
page = '\n'.join(keep) + '\n' + body.strip() + '\n' + '\n'.join(scripts) + '\n'
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(page)

SKIP = re.compile(r'(soundtrack\.wav$|soundtrack\.m4a$|/stems/|^assets/film/|\.glb$|/fonts$)')
files = []
for dp, _, fns in os.walk(DIST):
    for fn in fns:
        full = os.path.join(dp, fn)
        rel = os.path.relpath(full, DIST).replace(os.sep, '/')
        if rel == 'index.html' or SKIP.search(rel):
            continue
        files.append((rel, full, os.path.getsize(full)))
# the rendered film parts live in public/assets/film (copied into dist by vite)
film = [(f'assets/film/{fn}', os.path.join(DIST, 'assets', 'film', fn), os.path.getsize(os.path.join(DIST, 'assets', 'film', fn)))
        for fn in sorted(os.listdir(os.path.join(DIST, 'assets', 'film')))] if os.path.isdir(os.path.join(DIST, 'assets', 'film')) else []
batches, cur, size = [], {}, 0
for rel, full, sz in sorted(files, key=lambda x: x[0]) + film:
    if cur and (size + sz > 58 * 1024 * 1024 or len(cur) >= 240):
        batches.append(cur); cur, size = {}, 0
    cur[rel] = full
    size += sz
if cur:
    batches.append(cur)
json.dump(batches, open(os.path.join(OUT, 'files.json'), 'w'), indent=1)
print('page bytes', len(page), 'files', len(files) + len(film), 'batches', [len(b) for b in batches],
      'MB', round(sum(s for _, _, s in files + film) / 1e6, 1))
