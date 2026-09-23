#!/usr/bin/env python3
"""Regenerate docs/zencrevia-docs.html and docs/zencrevia-docs.pdf from the three Markdown
guides. Requires pandoc; the PDF also needs wkhtmltopdf.  Usage: python3 docs/build-docs.py"""
import html, json, os, re, shutil, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VERSION = json.load(open(os.path.join(ROOT, "package.json")))["version"]
DOCS = [("handover", "HANDOVER.md", "Serah Terima Developer", "mulai dari sini"),
        ("user", "USER-MANUAL.md", "Panduan Pengguna", "untuk anggota tim"),
        ("admin", "ADMIN-OPS.md", "Admin & Operasional", "untuk admin workspace & operator server"),
        ("dev", "DEVELOPER.md", "Developer Handbook", "untuk developer")]

def render(prefix, md):
    out = subprocess.run(["pandoc", "-f", "gfm", "-t", "html5", "--wrap=none", "--id-prefix=" + prefix + "-", os.path.join(HERE, md)],
                         check=True, capture_output=True, text=True).stdout
    # the page style formats code blocks as <pre class="code">; pandoc emits a bare <pre>
    out = re.sub(r'<pre(?![^>]*class=)', '<pre class="code"', out)
    ids = set(re.findall(r'id="([^"]+)"', out))
    # pandoc prefixes ids but not in-document links; point "#x" at "#prefix-x" when it exists
    out = re.sub(r'href="#([^"]+)"', lambda m: 'href="#%s"' % (prefix + "-" + m.group(1) if prefix + "-" + m.group(1) in ids else m.group(1)), out)
    heads = re.findall(r'<h2 id="([^"]+)"[^>]*>(.*?)</h2>', out, re.S)
    return out, [(i, re.sub(r"<[^>]+>", "", t).strip()) for i, t in heads]

nav, main, plain = [], [], []
for prefix, md, title, sub in DOCS:
    body, heads = render(prefix, md)
    nav.append('<div class="navgroup"><a class="navtop" href="#%s-top">%s<span>%s</span></a><ul>%s</ul></div>' % (
        prefix, html.escape(title), html.escape(sub), "".join('<li><a href="#%s">%s</a></li>' % (i, html.escape(t, quote=False)) for i, t in heads)))
    main.append('<section id="%s-top" class="doc" data-doc="%s">%s</section>' % (prefix, prefix, body))
    plain.append('<section class="doc" style="page-break-before:always">%s</section>' % body)

tpl = open(os.path.join(HERE, "docs-template.html"), encoding="utf-8").read()
page = tpl.replace("{{VERSION}}", VERSION).replace("{{NAV}}", "".join(nav)).replace("{{MAIN}}", "".join(main))
open(os.path.join(HERE, "zencrevia-docs.html"), "w", encoding="utf-8").write(page)
print("wrote docs/zencrevia-docs.html")

if shutil.which("wkhtmltopdf"):
    style = re.search(r"<style>(.*?)</style>", tpl, re.S).group(1)
    printable = ('<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Dokumentasi ZenCrevia %s</title><style>%s'
                 'aside{display:none} main{max-width:none;padding:0 8px} body{background:#fff}'
                 '@media (prefers-color-scheme: dark){:root{--bg:#fff;--surface:#fff;--text:#14171c}}</style></head>'
                 '<body><main><h1>Dokumentasi ZenCrevia</h1><p>Versi %s</p>%s</main></body></html>') % (VERSION, style, VERSION, "".join(plain))
    tmp = os.path.join(HERE, ".print.html"); open(tmp, "w", encoding="utf-8").write(printable)
    subprocess.run(["wkhtmltopdf", "--quiet", "--encoding", "utf-8", "--enable-local-file-access", "--page-size", "A4",
                    "--margin-top", "16mm", "--margin-bottom", "16mm", "--margin-left", "14mm", "--margin-right", "14mm",
                    "--footer-center", "[page] / [topage]", "--footer-font-size", "8", tmp, os.path.join(HERE, "zencrevia-docs.pdf")], check=False)
    os.remove(tmp); print("wrote docs/zencrevia-docs.pdf")
else:
    print("wkhtmltopdf not found; PDF not rebuilt", file=sys.stderr)
