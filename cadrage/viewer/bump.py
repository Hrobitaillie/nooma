#!/usr/bin/env python3
"""Cache-busting « zéro build » du viewer.

L'hébergement sert les .js/.css avec `Cache-Control: immutable` (via Caddy,
non modifiable par .htaccess). Le seul moyen fiable de forcer le rafraîchissement
est de changer l'URL. Ce script estampille TOUS les imports relatifs (.js) et les
références app.js/style.css de index.html avec le même `?v=<version>`.

À lancer après CHAQUE modification du code du viewer :
    python3 viewer/bump.py

La version = epoch courant (unique et monotone), écrite dans viewer/.version.
Comme tous les modules reçoivent la MÊME version, store.js reste un singleton.
"""
import re
import sys
import time
import pathlib

VIEWER = pathlib.Path(__file__).resolve().parent
version = sys.argv[1] if len(sys.argv) > 1 else str(int(time.time()))

# `from '...js'` / `from "...js"` / `import('...js')` avec chemin relatif
IMPORT_RE = re.compile(r"""(from\s+['"]|import\(\s*['"])(\.[^'"]+?\.js)(\?v=[0-9]+)?(['"])""")

changed = []
for f in sorted(VIEWER.rglob('*.js')):
    if 'assets' in f.parts or f.name == 'bump.py':
        continue
    src = f.read_text(encoding='utf-8')
    out = IMPORT_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={version}{m.group(4)}", src)
    if out != src:
        f.write_text(out, encoding='utf-8')
        changed.append(f.name)

index = VIEWER / 'index.html'
h = index.read_text(encoding='utf-8')
h = re.sub(r'(app\.js\?v=)[0-9]+', rf'\g<1>{version}', h)
h = re.sub(r'(style\.css\?v=)[0-9]+', rf'\g<1>{version}', h)
index.write_text(h, encoding='utf-8')

(VIEWER / '.version').write_text(version + '\n', encoding='utf-8')
print(f"version={version} — {len(changed)} fichiers JS estampillés + index.html")
