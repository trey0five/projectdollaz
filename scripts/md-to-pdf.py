#!/usr/bin/env python3
"""Render a Markdown file to a branded PDF (Markdown -> HTML -> WeasyPrint).

Usage:  python3 scripts/md-to-pdf.py <input.md> <output.pdf>
"""
import sys
import markdown
from weasyprint import HTML

CSS = """
@page {
  size: Letter;
  margin: 0.85in 0.8in 0.9in 0.8in;
  @bottom-center { content: counter(page) "  /  " counter(pages); font-size: 8.5pt; color: #6b6457; }
  @bottom-right { content: "KYRO"; font-size: 8.5pt; color: #b89650; }
}
* { box-sizing: border-box; }
body { font-family: "DejaVu Sans", "Helvetica", "Arial", sans-serif; font-size: 10.5pt;
       line-height: 1.5; color: #1e1e1e; }
h1 { font-size: 23pt; color: #1a2744; margin: 0 0 4px; border-bottom: 3px solid #b89650;
     padding-bottom: 8px; line-height: 1.15; }
h2 { font-size: 14.5pt; color: #1a2744; margin: 1.5em 0 0.4em; border-bottom: 1px solid #d0c8b8;
     padding-bottom: 3px; page-break-after: avoid; }
h3 { font-size: 11.5pt; color: #253460; margin: 1.15em 0 0.35em; page-break-after: avoid; }
h3 + p, h2 + p, h3 + ul, h2 + ul { page-break-before: avoid; }
p, li { margin: 0.35em 0; }
a { color: #b89650; text-decoration: none; }
strong { color: #1a2744; }
em { color: #3a3a3a; }
hr { border: none; border-top: 1px solid #d0c8b8; margin: 1.1em 0; }
table { border-collapse: collapse; width: 100%; font-size: 9.3pt; margin: 0.6em 0;
        page-break-inside: avoid; }
thead th { background: #1a2744; color: #ffffff; text-align: left; padding: 6px 8px;
           font-size: 9pt; }
td { border: 1px solid #d0c8b8; padding: 5px 8px; vertical-align: top; }
tbody tr:nth-child(even) td { background: #f4f1eb; }
blockquote { border-left: 4px solid #b89650; background: #faf8f4; margin: 0.7em 0;
             padding: 7px 13px; color: #3a3a3a; page-break-inside: avoid; }
blockquote p { margin: 0.2em 0; }
code { background: #f4f1eb; padding: 1px 4px; border-radius: 3px;
       font-family: "DejaVu Sans Mono", monospace; font-size: 8.8pt; color: #1a2744; }
pre { background: #f4f1eb; border: 1px solid #d0c8b8; border-radius: 6px; padding: 10px;
      overflow-x: auto; page-break-inside: avoid; }
pre code { background: none; padding: 0; font-size: 8.5pt; }
ul { padding-left: 1.3em; }
"""

def main():
    if len(sys.argv) != 3:
        print(__doc__); sys.exit(1)
    src, out = sys.argv[1], sys.argv[2]
    text = open(src, encoding="utf-8").read()
    body = markdown.markdown(
        text,
        extensions=["tables", "fenced_code", "sane_lists", "attr_list"],
        output_format="html5",
    )
    html = f"<!DOCTYPE html><html><head><meta charset='utf-8'><style>{CSS}</style></head><body>{body}</body></html>"
    HTML(string=html, base_url=".").write_pdf(out)
    print(f"wrote {out}")

if __name__ == "__main__":
    main()
