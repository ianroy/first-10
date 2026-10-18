"""Render the kit's deliberately small Markdown subset without external packages.

Public Markdown is the source. Supports headings, paragraphs, flat lists, tables,
links/bold and <!-- PAGE --> handout boundaries. Escapes source HTML.
"""
from pathlib import Path
import html
import json
import re

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'public' / 'teaching'

def inline(value):
    value = html.escape(value)
    value = re.sub(r'\[([^]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', value)
    return re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', value)

def render(text):
    lines = text.strip().splitlines()
    out = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                cells = [x.strip() for x in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r'[-: ]+', c) for c in cells):
                    rows.append(cells)
                i += 1
            out.append('<div class="table-wrap" tabindex="0" role="region" aria-label="Scrollable worksheet table"><table><thead><tr>' + ''.join('<th scope="col">'+inline(c)+'</th>' for c in rows[0]) + '</tr></thead><tbody>')
            for row in rows[1:]:
                out.append('<tr>'+''.join('<td>'+inline(c)+'</td>' for c in row)+'</tr>')
            out.append('</tbody></table></div>')
            continue
        heading = re.match(r'^(#{1,3}) (.*)', line)
        if heading:
            level = len(heading[1])+1
            out.append(f'<h{level}>{inline(heading[2])}</h{level}>')
            i += 1
            continue
        if re.fullmatch(r'(?:_+|-{3,})', line):
            out.append('<div class="writing-line" aria-hidden="true"></div>')
            i += 1
            continue
        list_match = re.match(r'^(- |\d+\. )(.*)', line)
        if list_match:
            tag = 'ul' if line.startswith('- ') else 'ol'
            out.append('<'+tag+'>')
            while i < len(lines):
                item = re.match(r'^(- |\d+\. )(.*)', lines[i].strip())
                if not item:
                    break
                out.append('<li>'+inline(item[2])+'</li>')
                i += 1
            out.append('</'+tag+'>')
            continue
        paragraph = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r'^(#|\||-{3,}$|- |\d+\. |_{4})',lines[i].strip()):
            paragraph.append(lines[i].strip())
            i += 1
        out.append('<p>'+inline(' '.join(paragraph))+'</p>')
    return '\n'.join(out)

manifest = json.loads((PUBLIC/'resources.json').read_text())
parts=[]
for resource in manifest['resources']:
    source=PUBLIC/(resource['id']+'.md')
    pages=source.read_text().split('<!-- PAGE -->')
    assert len(pages)==resource['printPages'], resource['id']
    for n,page in enumerate(pages,1):
        parts.append((resource['id']+'-'+str(n),render(page)))
nav=''.join(f'<a href="{r["id"]}.md" download>{html.escape(r["title"])} · Markdown</a>' for r in manifest['resources'])
sheets='\n'.join(f'<section class="sheet" id="{ident}" aria-label="Teaching kit page {i}"><div class="brand">FIRST TEN <span>BUILD · REACH · LEARN</span></div>{body}<footer>First Ten teaching kit · Version 1.0 · 18 October 2026 <span>{i} / {len(parts)}</span></footer></section>' for i,(ident,body) in enumerate(parts,1))
css='''
:root{color-scheme:light;--ink:#17383f;--muted:#41575c;--rule:#9cafad;--paper:#fff;--wash:#f2f5f1;--accent:#e0eee6}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;overflow-wrap:anywhere;background:var(--wash);color:var(--ink);font:16px/1.45 Arial,Helvetica,sans-serif}a{color:#135a68;text-decoration-thickness:1px;text-underline-offset:3px;overflow-wrap:anywhere}a:focus-visible,button:focus-visible{outline:3px solid #a04c22;outline-offset:4px}.skip{position:absolute;left:12px;top:-100px;background:white;padding:10px}.skip:focus{top:12px}.toolbar{max-width:900px;margin:24px auto;padding:0 28px}.toolbar h1{font-size:30px;line-height:1.1;margin:0 0 8px}.toolbar p{margin:8px 0}.downloads{display:flex;flex-wrap:wrap;gap:8px 20px;margin:16px 0}.downloads a{font-size:14px}button{border:1px solid var(--ink);border-radius:6px;background:var(--ink);color:white;font:inherit;padding:10px 18px;cursor:pointer}.sheet{max-width:900px;margin:24px auto;padding:34px 42px 24px;background:var(--paper);border:1px solid #d4dfd8;box-shadow:0 4px 20px #16383d0a}.brand{font-weight:700;font-size:12px;letter-spacing:.12em;border-bottom:2px solid var(--ink);padding-bottom:10px;margin-bottom:18px}.brand span{float:right;font-size:10px;color:var(--muted)}h2{font-size:30px;line-height:1.12;margin:0 0 12px;letter-spacing:-.02em}h3{font-size:17px;line-height:1.2;margin:16px 0 10px}h4{font-size:16px;margin:18px 0 8px}p{margin:10px 0}ul,ol{padding-left:23px;margin:10px 0}li{margin:5px 0}.table-wrap{overflow-x:auto}.table-wrap:focus-visible{outline:3px solid #a04c22;outline-offset:3px}table{min-width:560px;border-collapse:collapse;table-layout:fixed;width:100%;font-size:14px;line-height:1.35;margin:14px 0}th{background:var(--accent);text-align:left}th,td{border:1px solid var(--rule);padding:8px;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}#instructor-guide-1 th:nth-child(1){width:15%}#instructor-guide-1 th:nth-child(2){width:55%}#studyloop-case-1 th:nth-child(1){width:19%}#studyloop-case-1 th:nth-child(2){width:58%}.writing-line{height:25px;border-bottom:1px solid #bdcbc7;margin-bottom:7px}footer{border-top:1px solid var(--rule);padding-top:9px;margin-top:20px;font-size:10px;color:var(--muted)}footer span{float:right}strong{font-weight:700}@media(max-width:600px){.toolbar{padding:0 18px}.sheet{margin:16px 10px;padding:22px 18px}.brand span{float:none;display:block;margin-top:4px}h2{font-size:25px}table{font-size:12px}th,td{padding:5px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@page{size:A4;margin:12mm}@media print{body{background:white;font-size:10.2pt;line-height:1.28;color:#102f36}.toolbar,.skip{display:none}.sheet{border:0;box-shadow:none;max-width:none;width:auto;margin:0;padding:0;break-after:page}.sheet:last-child{break-after:auto}.brand{font-size:8pt;margin-bottom:4mm;padding-bottom:2mm}.brand span{font-size:7pt;float:right}h2{font-size:20pt;margin:0 0 3mm;break-after:avoid}h3{font-size:11.8pt;margin:3mm 0 2mm;break-after:avoid}h4{font-size:11pt;margin:3mm 0 2mm;break-after:avoid}p{margin:2mm 0;orphans:2;widows:2}ul,ol{margin:2mm 0;padding-left:5mm}li{margin:1mm 0}.table-wrap{overflow:visible}table{min-width:0;font-size:9pt;line-height:1.2;margin:3mm 0}th,td{padding:1.5mm}thead{display:table-header-group}.writing-line{height:6mm;margin-bottom:1.8mm}footer{font-size:7pt;margin-top:3mm;padding-top:2mm}a{color:inherit}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
'''
result=f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="A 60-minute fictional-case lesson, one-week $0 marketing assignment and reasoning-focused worksheets. No account or AI required."><title>First Ten · Printable teaching kit</title><style>{css}</style></head><body><a class="skip" href="#kit">Skip to teaching kit</a><header class="toolbar"><h1>Conversations into next steps</h1><p>A 60-minute lesson and one-week assignment. Editable, printable, and usable without an account or AI.</p><button type="button" onclick="window.print()">Print / Save as PDF</button><p>Use A4 paper, 100% scale and browser headers/footers off. Wide tables scroll on narrow screens. The nine handout pages are separated for printing; give worksheet A before the structured pages. Your browser's Print command works without this button.</p><nav class="downloads" aria-label="Editable Markdown downloads">{nav}</nav></header><main id="kit">{sheets}</main></body></html>'''
(PUBLIC/'first-ten-teaching-kit.html').write_text(result)
print(f'Rendered {len(parts)} handout pages from {len(manifest["resources"])} editable sources.')
