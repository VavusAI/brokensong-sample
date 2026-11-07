"""Builds the static sample edition: reads MEI files + DIAMM source records, writes JSON indexes and copies MEI.
Usage: python3 build.py <mei_dir> <site_dir> <diamm_cache_dir>"""
import sys, os, re, json, glob, shutil, time, unicodedata, urllib.request
import xml.etree.ElementTree as ET
MEI = 'http://www.music-encoding.org/ns/mei'; XL = 'http://www.w3.org/1999/xlink'; XMLNS = 'http://www.w3.org/XML/1998/namespace'
ET.register_namespace('', MEI); ET.register_namespace('xlink', XL)
NS = {'m': MEI}
mei_dir, site, cache = sys.argv[1:4]
os.makedirs(f'{site}/data/mei', exist_ok=True); os.makedirs(cache, exist_ok=True)
UA = 'DCI-Brands-tender-sample/1.0 (constantine@vavusai.com)'
SIGLA = {'Mo': 888, 'Fauv': 88, 'Trem': 98, 'Iv': 141, 'Fribourg': 15, 'Br': 4, 'Durham': 363, 'Cambrai': 271}
EXTRA_SOURCES = [4073]  # an English fragment with open images and no encodings yet (shows a source-only page)
report = {'repaired': [], 'skipped': [], 'reconstruction_demo': None}

def diamm(pk):
    p = f'{cache}/source-{pk}.json'
    if not os.path.exists(p):
        req = urllib.request.Request(f'https://www.diamm.ac.uk/sources/{pk}/', headers={'Accept': 'application/json', 'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=30) as r: open(p, 'wb').write(r.read())
        time.sleep(1)
    return json.load(open(p))

def fold(s):
    s = ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(c) != 'Mn')
    return s.replace('v', 'u').replace('j', 'i')  # medieval spelling: u/v and i/j are one letter

def load(path):
    raw = open(path, encoding='utf8').read()
    fixed, n = re.subn(r'xml:id="(m-\d+) midi\.bpm="(\d+)"\d*"', r'xml:id="\1" midi.bpm="\2"', raw)
    if n: report['repaired'].append({'file': os.path.basename(path), 'fixes': n})
    return ET.ElementTree(ET.fromstring(fixed)), fixed

def voice_texts(root):
    out = {}
    labels = {sd.get('n'): (sd.get('label') or sd.get(f'{{{XMLNS}}}id') or f'voice {sd.get("n")}') for sd in root.iter(f'{{{MEI}}}staffDef')}
    for staff in root.iter(f'{{{MEI}}}staff'):
        words = out.setdefault(labels.get(staff.get('n'), staff.get('n')), [])
        for syl in staff.iter(f'{{{MEI}}}syl'):
            t = (syl.text or '').strip()
            if not t: continue
            if words and words[-1].endswith('-'): words[-1] = words[-1][:-1] + t
            else: words.append(t)
            if syl.get('con') == 'd': words[-1] += '-'
    return {k: ' '.join(w.rstrip('-') for w in v) for k, v in out.items() if v}

def mark_reconstruction(tree, staff_n, first, last):
    """Demo only: wraps the notes of one voice in bars first..last in <supplied reason="reconstruction">."""
    measures = [m for m in tree.getroot().iter(f'{{{MEI}}}measure')]
    count = 0
    for i, m in enumerate(measures, start=1):
        if not (first <= i <= last): continue
        for staff in m.findall(f'm:staff[@n="{staff_n}"]', NS):
            for layer in staff.findall('m:layer', NS):
                kids = list(layer)
                if not kids: continue
                sup = ET.Element(f'{{{MEI}}}supplied', {'reason': 'reconstruction', 'resp': '#editor', 'type': 'reconstruction'})
                for k in kids: layer.remove(k); sup.append(k)
                layer.append(sup); count += len(kids)
    return count

BVMM_MANIFEST = 'https://bvmm.irht.cnrs.fr/iiif/8028/manifest'
_bv = json.load(open(f'{cache}/bvmm-8028-manifest.json'))
BVMM_CANVASES = {c['@id'].rsplit('-', 1)[1]: {'id': c['@id'], 'folio': c['label'].rsplit('f. ', 1)[-1]} for c in _bv['sequences'][0]['canvases']}
comps, sources = [], {}
for path in sorted(glob.glob(f'{mei_dir}/*.mei')):
    fid = os.path.splitext(os.path.basename(path))[0]
    try: tree, raw = load(path)
    except ET.ParseError as e:
        report['skipped'].append({'file': os.path.basename(path), 'error': str(e)}); continue
    root = tree.getroot()
    title = (root.findtext('.//m:workList/m:work/m:title', '', NS) or root.findtext('.//m:fileDesc/m:titleStmt/m:title', '', NS)).replace(': A Digital Edition', '').strip()
    composer = ' '.join((root.findtext('.//m:work//m:composer//m:persName', '', NS) or root.findtext('.//m:work//m:composer', '', NS) or 'Anonymous').split())
    if 'Phliippe' in composer:
        report.setdefault('normalised', []).append({'file': os.path.basename(path), 'composer': composer}); composer = composer.replace('Phliippe', 'Philippe')
    genre = (root.findtext('.//m:work//m:classification//m:term', '', NS) or 'Motet').strip()
    src = root.find('.//m:sourceDesc/m:source', NS)
    siglum = (src.findtext('.//m:identifier', '', NS) if src is not None else '').strip()
    iiif, folio, links = None, None, {}
    canvas = None
    for it in root.findall('.//m:sourceDesc/m:source/m:itemList/m:item', NS):
        tt = it.get('targettype')
        if tt == 'IIIF':
            links['library_iiif_manifest'] = it.get('target').replace('http://', 'https://'); folio = (it.get('codedval') or '').strip()
        elif tt == 'other_images' and 'bvmm.irht.cnrs.fr' in (it.get('target') or '') and 'VUE_ID=' in it.get('target'):
            vue = re.search(r'VUE_ID=(\d+)', it.get('target')).group(1)
            cv = BVMM_CANVASES.get(vue)
            if cv: iiif, canvas, folio = BVMM_MANIFEST, cv['id'], cv['folio']
            links[tt] = it.get('target')
        else: links[tt] = it.get('target')
    clefs = next((a.text.split(':', 1)[1].strip() for a in root.findall('.//m:sourceDesc/m:source/m:notesStmt/m:annot', NS) if a.get('label') == 'original_clefs' and a.text and ':' in a.text), '')
    texts = voice_texts(root)
    voices = [sd.get('label') or sd.get(f'{{{XMLNS}}}id') for sd in root.iter(f'{{{MEI}}}staffDef')]
    bars = len(list(root.iter(f'{{{MEI}}}measure')))
    rec = 0
    if fid == '305':  # demonstration of how reconstructed material is shown
        rec = mark_reconstruction(tree, '3', 5, 12)
        report['reconstruction_demo'] = {'file': '305.mei', 'voice': 'tenor (staff 3)', 'bars': '5-12', 'elements_wrapped': rec}
    tree.write(f'{site}/data/mei/{fid}.mei', encoding='UTF-8', xml_declaration=True)
    FR = set('et les la le li de du des je que qui mout mon ma amours amors cuer dame vous nous mes est pas ne'.split()) - {'qui', 'est', 'et'}
    LA = set('et in est qui quod deus cum ad non per sed virgo regina domine sancta tu nos sit ut quia'.split()) - {'et'}
    langs = []
    for v in texts.values():
        w = fold(v).split(); fr = sum(fold(x) in {fold(y) for y in FR} for x in w); la = sum(fold(x) in {fold(y) for y in LA} for x in w)
        if fr or la: langs.append('French' if fr > la else 'Latin')
    lang = ' and '.join(sorted(set(langs), key=lambda x: x != 'Latin')) if langs else ''
    comps.append(dict(id=fid, title=title, composer=composer, genre=genre, siglum=siglum, folio=folio or '', iiif=iiif, canvas=canvas, links=links,
        voices=voices, nvoices=len(voices), bars=bars, clefs=clefs, texts=texts, language=lang,
        fragmentary=bool(rec), reconstructed_bars='bars 5-12 of the tenor' if rec else '', notation='Ars Nova / late 13th-c. mensural (transcribed)',
        search=fold(' '.join([title, composer, siglum, ' '.join(texts.values())]))))
    sources.setdefault(siglum, []).append(fid)

src_out = []
for sig, pk in list(SIGLA.items()) + [(None, p) for p in EXTRA_SOURCES]:
    d = diamm(pk)
    man = d.get('manifest_url') or ''
    if pk == 888: man = BVMM_MANIFEST
    if 'gallica.bnf.fr' in man: man = ''  # Gallica sends no CORS headers, so browsers cannot load it from another site
    src_out.append(dict(id=sig or f'diamm-{pk}', siglum=sig or '', diamm_pk=pk, name=d.get('display_name'), date=d.get('date_statement') or '',
        summary=d.get('display_summary') or '', shelfmark=d.get('shelfmark'), archive=(d.get('archive') or {}).get('name', ''),
        city=(d.get('archive') or {}).get('city', '') if isinstance((d.get('archive') or {}).get('city'), str) else '',
        source_type=d.get('source_type') or '', measurements=d.get('measurements') or '', surface=d.get('surface_type') or '',
        notations=[n.get('name') if isinstance(n, dict) else n for n in (d.get('notations') or [])],
        manifest=man.replace('http://', 'https://') if man.startswith(('http://', 'https://')) and 'uv/#' not in man else '',
        images_open=bool(man) and ('diamm.ac.uk' not in man), library_viewer=(d.get('manifest_url') or '') if 'gallica' in (d.get('manifest_url') or '') else '', diamm_url=d.get('url'),
        compositions=sources.get(sig, [])))
MENS = os.path.join(os.path.dirname(mei_dir.rstrip('/')), '..', 'mens', 'ex_complete.mei')
if os.path.exists(MENS):  # original-notation (mensural) excerpt of De touz from mei-friend (CC0), shown as an alternative view
    shutil.copy(MENS, f'{site}/data/mei/de_touz.mensural.mei')
    for c in comps:
        if c['id'] == 'de_touz': c['mensural'] = 'de_touz.mensural.mei'; c['mensural_note'] = 'Excerpt (triplum and tenor) in the original black mensural notation; encoding: mei-friend mensural skeleton, CC0.'
    report['mensural_view'] = 'de_touz'
json.dump(comps, open(f'{site}/data/compositions.json', 'w'), ensure_ascii=False)
json.dump(src_out, open(f'{site}/data/sources.json', 'w'), ensure_ascii=False)
stats = dict(compositions=len(comps), sources=len(src_out), voices3=sum(c['nvoices'] == 3 for c in comps), voices4=sum(c['nvoices'] == 4 for c in comps),
             fragmentary=sum(c['fragmentary'] for c in comps), with_images=sum(1 for c in comps if c['iiif']), built=time.strftime('%Y-%m-%d %H:%M'))
json.dump(stats, open(f'{site}/data/stats.json', 'w'))
json.dump(report, open(f'{site}/data/build-report.json', 'w'), indent=1)
print(json.dumps(stats)); print(json.dumps(report))
