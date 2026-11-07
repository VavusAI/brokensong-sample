"""Build step: print every piece's score page (print.html) to data/pdf/<id>.pdf.

Usage: serve the site folder locally, then
    python build/make_pdfs.py http://127.0.0.1:8743/ [id ...]
Needs Playwright with Google Chrome installed. The PDFs are static files, so the
published site still needs no server-side code.
"""
import json, os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FOOT = ('<div style="width:100%;font:7.5pt Helvetica,Arial,sans-serif;color:#6b6257;padding:0 15mm;display:flex;justify-content:space-between">'
        '<span class="title"></span>'
        '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>')

def main():
    base = sys.argv[1].rstrip('/') + '/'
    comps = json.load(open(os.path.join(ROOT, 'data', 'compositions.json'), encoding='utf-8'))
    ids = sys.argv[2:] or [c['id'] for c in comps]
    out = os.path.join(ROOT, 'data', 'pdf'); os.makedirs(out, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page()
        for cid in ids:
            page.goto(f'{base}print.html?id={cid}')
            page.wait_for_function('window.__printReady > 0', timeout=90000)
            page.pdf(path=os.path.join(out, f'{cid}.pdf'), format='A4', print_background=True,
                     display_header_footer=True, header_template='<div></div>', footer_template=FOOT,
                     margin={'top': '16mm', 'bottom': '18mm', 'left': '15mm', 'right': '15mm'})
            print('pdf', cid, page.evaluate('window.__printReady'), 'systems')
        browser.close()

if __name__ == '__main__':
    main()
