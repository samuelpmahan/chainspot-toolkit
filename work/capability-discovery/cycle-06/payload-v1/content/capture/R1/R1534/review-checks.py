"""R1534 read-only checks of generated display artifacts; no producer import."""
import collections
import csv
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

root = Path('/workspace/scratch/8528bb251845/discovery-cycle06')
new = root / 'V2/E1531/display-v4'
old = root / 'V2/E1522/display-v1'
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def equal(a, b):
    assert a.read_bytes() == b.read_bytes(), (str(a), str(b))
    return {'left':str(a.relative_to(root)), 'right':str(b.relative_to(root)), 'sha256':sha(a), 'bytes':a.stat().st_size}

byte_equal = [equal(new/'descriptive-table.csv', old/'descriptive-table.csv'),
              equal(new/'descriptive-table.csv', root/'V2/E1531/renderer.stdout.raw'),
              equal(new/'report.html', old/'report.html')]
for group in ('primary', 'bright-nonpath', 'normal-plus6'):
    byte_equal.append(equal(new/f'group-{group}.svg', old/f'group-{group}.svg'))
manifest = json.loads((new/'display-manifest.json').read_text())
for artifact in manifest['artifacts']:
    path = new/artifact['path']
    assert path.stat().st_size == artifact['bytes']
    assert sha(path) == artifact['sha256']
assert manifest['claims'] == {'promoted':False, 'heldout':False, 'pathIdentity':'UNKNOWN', 'physicalEdgeIdentity':'UNKNOWN', 'continuity':'UNKNOWN', 'calibratedWidth':'UNKNOWN', 'scientificAcceptance':'UNKNOWN', 'humanAcceptance':'UNKNOWN'}

rows = list(csv.DictReader((new/'descriptive-table.csv').open()))
lookup = {(r['group'],r['window'],r['nominalWidth'],r['query'],r['field'],r['index']):r for r in rows}
svg = ET.parse(new/'group-masked-primary.svg').getroot()
old_svg = ET.parse(old/'group-masked-primary.svg').getroot()
texts = [e for e in svg.iter() if e.tag.endswith('text')]
annotations = [e for e in texts if 'data-series' in e.attrib]
expected_annotations = collections.Counter()
station_checks=[]
for window, indices, invalid, n in [('core16',[7,8,9],[5,6,10,11],16),('long48',[23,24,25],[21,22,26,27],48)]:
    for width in ('34','42','50'):
        for side,field in [('L','leftLum'),('R','rightLum')]:
            selected=[lookup[('masked-primary',window,width,'stationContrast',field,str(i))] for i in range(n)]
            nan_indices=[i for i,r in enumerate(selected) if r['value']=='NaN']
            finite_invalid=[i for i,r in enumerate(selected) if r['validity']=='0' and r['value']!='NaN']
            assert nan_indices==indices
            assert finite_invalid==invalid
            assert all(math.isfinite(float(selected[i]['value'])) for i in invalid)
            assert sum(r['validity']=='1' for r in selected)==n-7
            expected_annotations[(side,'NaN',','.join(map(str,indices)),f"{side} NaN @{','.join(map(str,indices))}")]+=1
            station_checks.append({'window':window,'width':width,'side':side,'NaN_indices':nan_indices,'finite_invalid_indices':finite_invalid,'valid':n-7,'total':n})
assert collections.Counter((e.attrib['data-series'],e.attrib['data-token'],e.attrib['data-indices'],e.text) for e in annotations)==expected_annotations
assert all(e.attrib['font-size']=='8' for e in annotations)
hollows=[e for e in svg.iter() if e.tag.endswith('circle') and e.attrib.get('fill')=='white']
assert len(hollows)==48, len(hollows)
old_text=[e.text for e in old_svg.iter() if e.tag.endswith('text') and e.text not in ('NaN','null','Infinity','-Infinity')]
new_text=[e.text for e in texts if 'data-series' not in e.attrib]
assert old_text==new_text
conditions=[r for r in rows if r['field']=='condition']
assert len(conditions)==4
assert all(r['value']=='no edge pair' and r['state']=='COMPLETED' for r in conditions)
thresholds=[r for r in rows if r['field']=='overlay.threshold']
assert len(thresholds)==48 and all(r['value']=='null' for r in thresholds)
assert collections.Counter(r['state'] for r in rows)=={'COMPLETED':14972}
html=(new/'report.html').read_text()
assert 'UNKNOWN' in html and 'No width selection' in html and 'no edge pair' in html
print(json.dumps({'status':'PASS','byte_equal_checks':byte_equal,'manifest_artifacts_verified':len(manifest['artifacts']),'csv_data_rows':len(rows),'all_row_states':'COMPLETED','unchanged_nonannotation_SVG_texts':len(new_text),'NaN_annotation_nodes':len(annotations),'annotation_font_size_px':8,'hollow_finite_invalid_circles':len(hollows),'station_checks':station_checks,'native_conditions':[{k:r[k] for k in ('comparison','nominalWidth','state','value')} for r in conditions],'null_overlay_thresholds':len(thresholds),'claims':manifest['claims'],'limits':'Display artifacts only. Whole HTML byte identity reuses prior raw-link/data inspection; no browser, raw wire, source pixels, CV, renderer or converter invoked.'},indent=2))
