# python3 build.py   (after measure.py, dash.py, hallway.py; writes ledger.json and ledger.png)
# Invariant ledger (Sam, 2026-10-17): "Nothing may be asserted to be constant unless it holds across both courses and zoom
# scales. In blind prod runs, detecting that which is constant locally is an INCREDIBLY POWERFUL ORIENTATION/specialization
# we get for free."
#   GLOBAL  the same value on every image, full courses AND zoomed views (screen px, or a ratio, or a model in R1)
#   LOCAL   one value per image (tight within it), different between images: measure it on every run
#   VARIABLE not constant even within an image or a view (counts that depend on what the view shows)
# R1 (the C1S radius, 10 m on the ground) is each image's map scale in px.
import json, math, os, numpy as np
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); TK = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
M = json.load(open(f'{HERE}/measure-raw.json')); D = json.load(open(f'{HERE}/dash-raw.json')); HW = json.load(open(f'{HERE}/hallway-raw.json'))
NAMES = list(M); FULL = [n for n in NAMES if M[n]['scale'] == 'full']; ZOOM = [n for n in NAMES if M[n]['scale'] == 'zoom']
def template(n):
    p = f'{TK}/baselines/s3assoc/{n}.json'
    return json.load(open(p if os.path.exists(p) else f'{HERE}/assoc/{n}.json'))['template']
T = {n: template(n) for n in NAMES}
R1 = {n: M[n]['rings']['R1'] for n in NAMES}
r = lambda v, k=3: round(float(v), k)
spread = lambda vals: [r(min(vals)), r(max(vals))]

ledger = []
def add(q, unit, scope, value, perImage, evidence, use):
    holds = {'full': [n for n in FULL if n in perImage], 'zoom': [n for n in ZOOM if n in perImage]}
    if scope == 'GLOBAL': assert holds['full'] and holds['zoom'], f'{q}: GLOBAL needs full and zoom evidence'
    ledger.append(dict(quantity=q, unit=unit, scope=scope, value=value, perImage=perImage, imagesFull=holds['full'], imagesZoom=holds['zoom'], evidence=evidence, use=use))

# --- sprites (screen px) ---
sizes = {n: sorted({tuple(s) for s in M[n]['basketSizes']}) for n in NAMES}
nb = sum(len(M[n]['basketSizes']) for n in NAMES)
assert all(s == [(46, 72)] for s in sizes.values())
add('basket sprite size', 'px [width, height]', 'GLOBAL', [46, 72], {n: [46, 72] for n in NAMES},
    f'{nb} baskets on {len(NAMES)} images: one size, no exception', 'S2 size test; BasketPoint = bbox (x + 22.5, y + 71) + offset')
lab = {}
for n in NAMES:
    for l, s in M[n]['badgeSizeByLabel'].items(): lab.setdefault(l, {})[n] = s
assert all(len({tuple(s) for s in v.values()}) == 1 for v in lab.values())
add('badge sprite size by label', 'px [width, height]', 'GLOBAL', {l: next(iter(v.values())) for l, v in sorted(lab.items(), key=lambda kv: int(kv[0]))},
    {n: len(M[n]['badgeSizeByLabel']) for n in NAMES},
    f'{sum(len(v) for v in lab.values())} clean badges (frame is its own S1 part), every label one size on every image it appears on', 'S1 merged-frame detector (off-size <=> frame merged)')

# --- strokes (screen px) ---
se = {n: T[n]['se'] for n in NAMES}; ss = {n: T[n]['ss'] for n in NAMES}; w1 = {n: M[n]['rings']['w1'] for n in NAMES}
add('pad frame stroke, ends', 'px (AA render fit)', 'GLOBAL', spread(se.values()), se, f'R1 grows x{max(R1.values())/min(R1.values()):.2f} across these images; the stroke spread is {max(se.values())-min(se.values()):.2f} px', 'pad render model; S3 border margins (2-7 px)')
add('pad frame stroke, sides', 'px (AA render fit)', 'GLOBAL', spread(ss.values()), ss, f'spread {max(ss.values())-min(ss.values()):.3f} px', 'pad render model')
add('C1S stroke', 'px (FWHM of the mean radial profile, 0.25 px steps)', 'GLOBAL', spread(w1.values()), w1,
    f'spread {max(w1.values())-min(w1.values()):.2f} px (3 radial steps) while R1 grows x{max(R1.values())/min(R1.values()):.2f}; screen-constant, not map-scaled', 'C1S Part stroke')

# --- rings ---
q = {n: r(M[n]['rings']['R2'] / M[n]['rings']['R1']) for n in NAMES}
add('C2D radius / C1S radius', 'ratio', 'GLOBAL', 2, q, f'{min(q.values()):.3f}-{max(q.values()):.3f} (radius resolution 0.25 px)', 'C2D Part = 2 x R1 around the BasketPoint')
add('C1S radius R1 (10 m)', 'px', 'LOCAL', spread(R1.values()), R1, 'one radius per image (pair fit (R, 2R) over every basket); zoomed Lenard 55.5-56.25 px vs full Lenard 24 px. On the ground the rings are the app\'s definition (10 m, 20 m) and never vary',
    'THE scale anchor, and the only one: everything course-made (pads, hallways) is predicted from it and checked, never used to set it')

# --- pad (map-scaled body + screen-px stroke) ---
x = np.array([R1[n] for n in NAMES])
def fit(vals):
    y = np.array([vals[n] for n in NAMES]); b, a = np.polyfit(x, y, 1); res = y - (a + b * x)
    return r(a), r(b, 4), {n: r(v, 2) for n, v in zip(NAMES, res)}, r(np.abs(res).max(), 2)
L = {n: T[n]['L'] for n in NAMES}; Wd = {n: T[n]['W'] for n in NAMES}; FP = {n: float(np.median(M[n]['padFramePx'])) for n in NAMES}
aL, bL, resL, mL = fit(L); aW, bW, resW, mW = fit(Wd); aF, bF, resF, mF = fit(FP)
add('pad length', 'px (AA render fit, template median per image)', 'LOCAL', spread(L.values()), L,
    f'OBSERVED prior (course data, could vary on another course): L = {aL} px + {bL} x R1 (max residual {mL} px on {len(NAMES)} images): a {bL*10:.2f} m body plus a screen-px stroke ({aL} px ~ the end stroke)', 'where S3 looks first; a course whose pads miss it is a finding, never a rescale')
add('pad width', 'px (AA render fit, template median per image)', 'LOCAL', spread(Wd.values()), Wd,
    f'OBSERVED prior (course data): W = {aW} px + {bW} x R1 (max residual {mW} px): a {bW*10:.2f} m body plus the side stroke', 'pad prior; checked, never a scale source')
add('pad frame pixel count', 'px (count, S3 frame part, median per image)', 'LOCAL', spread(FP.values()), FP,
    f'~linear in R1: {aF} px + {bF} x R1 (max residual {mF} px): a screen-px stroke around a map-scaled perimeter', 'S3 size bounds relative to R1, never absolute')
exec('IMAGES_LIST=' + open(f'{HERE}/measure.py').read().split('IMAGES=')[1].split('\nsamp=')[0])
bf = {}
for n, _, a in IMAGES_LIST:
    fam = json.load(open(f'{TK}/attempts/stages/{a}/fork/stage-output/early/artifacts/s3fix/px.tees.family-refined.json'))
    v = [c['measurements']['frame']['bandFill'] for c in fam['candidates'] if c.get('anchor')]
    bf[n] = dict(median=r(np.median(v)), min=r(min(v)), max=r(max(v)), anchors=len(v))
fz = lambda ns, k: [r(min(bf[n][k] for n in ns)), r(max(bf[n][k] for n in ns))]
add('S3 band fill (frame px / band area)', 'fraction', 'LOCAL', {'full': fz(FULL, 'median'), 'zoom': fz(ZOOM, 'median')}, bf,
    f'anchor medians {fz(FULL, "median")} on full courses vs {fz(ZOOM, "median")} zoomed: the old absolute bound 0.65-1.05 found no anchor pad on Lenard-3/-4/-5',
    'S3 structural fix bounds it relative to the image median (0.75-1.3 x)')

# --- hallway and dashes: LOCAL, with two scale regimes ---
hw = {n: HW[n]['widthPx'] for n in NAMES}; hr = {n: r(hw[n] / R1[n]) for n in NAMES}
dpc = {n: r(2 * math.pi * M[n]['rings']['R2'] / D[n]['C2D']['periodPx'], 2) for n in NAMES}; per = {n: D[n]['C2D']['periodPx'] for n in NAMES}
coarse = [n for n in NAMES if R1[n] <= 30]; fine = [n for n in NAMES if R1[n] > 30]
add('hallway width', 'px (edge-pair fit on tee->badge segments, median per image)', 'LOCAL', spread(hw.values()), hw,
    f'within an image IQR <= {max(HW[n]["widthIQR"][1]-HW[n]["widthIQR"][0] for n in NAMES):.2f} px; between images 31-52 px. Width / R1 has two values: '
    f'{min(hr[n] for n in fine):.3f}-{max(hr[n] for n in fine):.3f} when R1 >= 36 px ({", ".join(fine)}), {min(hr[n] for n in coarse):.3f}-{max(hr[n] for n in coarse):.3f} when R1 <= 27 px ({", ".join(coarse)}); '
    'Lenard is in both (full 1.489, zoom 0.93), so the regime follows map scale, not the course', 'HolePath width: learn per image from its 18 tee->badge segments')
add('C2D dash period', 'px of arc (pooled sinusoid fit, 0.25 px steps)', 'LOCAL', spread(per.values()), per,
    f'doctrine said ~25.5 px screen-constant: it is not (21.5-33.5 px). Dashes per C2 circle: {min(dpc[n] for n in fine)}-{max(dpc[n] for n in fine)} when R1 >= 36 px, '
    f'{min(dpc[n] for n in coarse)}-{max(dpc[n] for n in coarse)} when R1 <= 27 px (same split as the hallway)', 'C2D dash phase model (open)')
add('hallway width / R1, dashes per C2 circle (regime)', 'ratio; count (dashes)', 'LOCAL', {'R1 <= 27 px': [r(min(hr[n] for n in coarse)), r(max(hr[n] for n in coarse))], 'R1 >= 36 px': [r(min(hr[n] for n in fine)), r(max(hr[n] for n in fine))]},
    {n: {'hallwayOverR1': hr[n], 'dashesPerC2': dpc[n]} for n in NAMES},
    'two signals agree on the regime on all 11 images; the threshold lies between R1 27 and 36 px (no image in between): a hypothesis, measured per image, never assumed', 'orientation: measure R1 and the dash count, predict the hallway width, then confirm it on the tee->badge segments')

# --- view-dependent counts ---
cnt = {n: {'badges': len(M[n]['badgeSizeByLabel']), 'baskets': len(M[n]['basketSizes'])} for n in NAMES}
add('baskets vs badges in view', 'count', 'VARIABLE', None, cnt,
    'a partial view can show a basket whose badge is off-screen (lenard4: 7 baskets, 6 badges); only a full view (labels 1..18) makes "baskets <= badges" and the S4 deficit meaningful', 'S2 observer: deficit/overBadgeCount judged on full views only')

json.dump(dict(schema='nctk-invariant-ledger@1', rule='GLOBAL only when it holds on full courses AND zoomed views', images={n: M[n]['scale'] for n in NAMES},
               padModel=dict(lengthPx=[aL, bL], widthPx=[aW, bW], unit='px = a px + b x R1 px', maxResidualPx=[mL, mW]),
               regime=dict(thresholdR1Px=[27, 36], hallwayOverR1={'R1<=27': [min(hr[n] for n in coarse), max(hr[n] for n in coarse)], 'R1>=36': [min(hr[n] for n in fine), max(hr[n] for n in fine)]},
                           dashesPerC2={'R1<=27': [min(dpc[n] for n in coarse), max(dpc[n] for n in coarse)], 'R1>=36': [min(dpc[n] for n in fine), max(dpc[n] for n in fine)]}),
               entries=ledger), open(f'{HERE}/ledger.json', 'w'), indent=1)

# ---------------- render ----------------
F = '/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf'; FB = '/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf'
f12, f14, f16, f22 = (ImageFont.truetype(F, s) for s in (12, 14, 16, 22)); b16 = ImageFont.truetype(FB, 16)
PW, PH, PAD = 440, 330, 52; COLS, ROWS = 4, 2; HEAD = 70
img = Image.new('RGB', (PW * COLS, HEAD + PH * ROWS + 40), 'white'); dr = ImageDraw.Draw(img)
dr.text((12, 10), 'Invariant ledger: what is constant across courses AND zoom (6 full courses, filled circles; 5 zoomed Lenard views, hollow squares)', font=f22, fill='black')
dr.text((12, 40), 'x axis: R1 = the C1S radius in px, the ONLY scale anchor (the rings are 10 m / 20 m by definition). GLOBAL = flat in screen px or exact in R1;  LOCAL = one value per image.', font=f14, fill=(60, 60, 60))
SCOPE_COL = {'GLOBAL': (20, 120, 50), 'LOCAL': (30, 80, 190), 'VARIABLE': (180, 60, 30)}
def panel(i, title, scope, ylo, yhi, series, lines=(), note='', ylab=''):
    ox, oy = (i % COLS) * PW, HEAD + (i // COLS) * PH
    x0, x1, y0, y1 = ox + PAD, ox + PW - 14, oy + 46, oy + PH - 58
    X = lambda v: x0 + (v - 15) / (60 - 15) * (x1 - x0); Y = lambda v: y1 - (v - ylo) / (yhi - ylo) * (y1 - y0)
    dr.rectangle([ox + 4, oy + 4, ox + PW - 4, oy + PH - 4], outline=(200, 200, 200))
    dr.text((ox + 10, oy + 8), title, font=b16, fill='black')
    dr.text((ox + PW - 14 - dr.textlength(scope, font=b16), oy + 26), scope, font=b16, fill=SCOPE_COL[scope.split()[0].rstrip(',')])
    dr.line([x0, y1, x1, y1], fill='black'); dr.line([x0, y0, x0, y1], fill='black')
    for t in (20, 30, 40, 50, 60):
        dr.line([X(t), y1, X(t), y1 + 4], fill='black'); dr.text((X(t) - 6, y1 + 5), str(t), font=f12, fill='black')
    for k in range(5):
        v = ylo + k * (yhi - ylo) / 4; dr.line([x0 - 4, Y(v), x0, Y(v)], fill='black'); dr.text((ox + 6, Y(v) - 7), f'{v:g}' if abs(v) >= 10 else f'{v:.2g}', font=f12, fill='black')
    dr.text((x1 - 70, y1 + 18), 'R1 (px)', font=f12, fill=(80, 80, 80)); dr.text((x0 + 4, y0 - 14), ylab, font=f12, fill=(80, 80, 80))
    for fn, col, lab, *at in lines:   # optional 4th: the R1 at which the label sits, below the line
        pts = [(X(v), Y(fn(v))) for v in np.linspace(15, 60, 50) if ylo <= fn(v) <= yhi]
        if len(pts) > 1: dr.line(pts, fill=col, width=1)
        if lab and pts and at: dr.text((X(at[0]), Y(fn(at[0])) + 6), lab, font=f12, fill=col)
        elif lab and pts: dr.text((pts[-1][0] - dr.textlength(lab, font=f12), pts[-1][1] - 16), lab, font=f12, fill=col)
    for vals, col in series:
        for n, v in vals.items():
            px, py = X(R1[n]), Y(v)
            if M[n]['scale'] == 'full': dr.ellipse([px - 4, py - 4, px + 4, py + 4], fill=col)
            else: dr.rectangle([px - 4, py - 4, px + 4, py + 4], outline=col, width=2)
    for k, line in enumerate(note.split('\n')): dr.text((ox + 10, oy + PH - 36 + k * 15), line, font=f12, fill=(40, 40, 40))
    return X, Y
panel(0, 'Basket sprite (px)', 'GLOBAL px', 40, 80, [({n: 46 for n in NAMES}, (200, 90, 0)), ({n: 72 for n in NAMES}, (120, 40, 140))],
      note=f'width 46 px (orange), height 72 px (purple) on all {nb} baskets\nof all 11 images: no exception', ylab='px')
panel(1, 'Badge sprite width by label (px)', 'GLOBAL px', 52, 59, [({n: v[0] for n, v in lab[l].items()}, c) for l, c in (('1', (0, 0, 0)), ('12', (0, 120, 200)), ('14', (0, 160, 80)), ('10', (200, 0, 0)))],
      note='label 1 54, 12 55, 14 56, 10 57 px (height 42 px always);\nevery label one size on every image it appears on', ylab='px')
panel(2, 'Strokes (px)', 'GLOBAL px', 2, 4.5, [(se, (200, 0, 0)), (ss, (0, 120, 200)), (w1, (0, 150, 60))],
      note=f'pad end stroke {min(se.values()):.2f}-{max(se.values()):.2f} (red), side {min(ss.values()):.2f}-{max(ss.values()):.2f} (blue),\nC1S {min(w1.values())}-{max(w1.values())} px (green): flat while R1 grows x2.6', ylab='px')
panel(3, 'C2D radius / C1S radius', 'GLOBAL ratio', 1.8, 2.2, [(q, (90, 0, 140))], lines=[(lambda v: 2.0, (150, 150, 150), '2')],
      note=f'{min(q.values()):.3f}-{max(q.values()):.3f}: R2 = 2 x R1 exactly,\nradius resolution 0.25 px', ylab='ratio')
panel(4, 'Pad template (px)', 'LOCAL, observed prior', 0, 40, [(L, (200, 0, 0)), (Wd, (0, 120, 200))],
      lines=[(lambda v: aL + bL * v, (200, 0, 0), f'L = {aL} px + {bL} R1', 34), (lambda v: aW + bW * v, (0, 120, 200), f'W = {aW} px + {bW} R1', 34)],
      note=f'{bL*10:.1f} m x {bW*10:.1f} m body + screen-px stroke on these 11 images;\ncourse data: a prior to check, never a scale source', ylab='px')
panel(5, 'Pad frame pixel count', 'LOCAL', 0, 400, [(FP, (0, 0, 0))], lines=[(lambda v: aF + bF * v, (120, 120, 120), f'{aF:.1f} px + {bF:.2f} R1', 30)],
      note=f'median frame px per image; max residual {mF:.0f} px.\nS3 absolute size/fill bounds broke at zoom', ylab='px (count)')
X6, Y6 = panel(6, 'Hallway width (px)', 'LOCAL (2 regimes)', 25, 60, [(hw, (0, 0, 0))],
      lines=[(lambda v: 0.935 * v, (0, 120, 200), '0.935 R1'), (lambda v: 1.48 * v, (200, 0, 0), '1.48 R1')],
      note='Lenard full 35.7 px (1.49 R1) vs zoom 51.7-52.4 px (0.93 R1):\nneither screen px nor map-scaled; learn it per image', ylab='px')
panel(7, 'Dashes per C2D circle', 'LOCAL (2 regimes)', 0, 25, [(dpc, (0, 0, 0))], lines=[(lambda v: 21.0, (0, 120, 200), '21'), (lambda v: 10.2, (200, 0, 0), '~10')],
      note='2 pi R2 / dash period: same split as the hallway;\nthe "25.5 px screen-constant" period was wrong', ylab='count')
for i in (6, 7):   # the unobserved band between the regimes
    ox, oy = (i % COLS) * PW, HEAD + (i // COLS) * PH; x0, x1 = ox + PAD, ox + PW - 14
    X = lambda v: x0 + (v - 15) / 45 * (x1 - x0); dr.rectangle([X(27.5), oy + 46, X(35.5), oy + PH - 58], outline=(230, 180, 0))
    dr.text((X(27.5) + 3, oy + 48), 'no image', font=f12, fill=(200, 150, 0))
dr.text((12, HEAD + PH * ROWS + 10), 'Sources: measure.py (sprites, rings, frame px), dash.py, hallway.py (s7main/teebadge.py), AA pad templates (baselines/s3assoc, ./assoc). '
        'Data: ledger.json.', font=f14, fill=(60, 60, 60))
img.save(f'{HERE}/ledger.png')
for e in ledger: print(f"{e['scope']:8s} {e['quantity']}: {e['value']} [{e['unit']}]")
