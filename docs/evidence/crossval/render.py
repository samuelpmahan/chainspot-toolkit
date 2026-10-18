# python3 render.py [course ...]   One legible page per course from crossval.json: every hole's tee (T n), badge and
# claimed basket (K n), the line that claims the basket (3-point straight: tee -> badge -> basket, solid; spoke: basket ->
# next tee, dashed), coloured by how much evidence agrees. Plus a crop sheet of every hole that is NOT two-signal
# confirmed, which is where a human (or the next stage) should look.
import json, os, sys, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import crossval as cv
HERE = os.path.dirname(os.path.abspath(__file__))
FB = '/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf'
COL = {'two signals agree': (40, 220, 60), 'one signal (straight)': (255, 220, 0), 'one signal (spoke)': (255, 220, 0),
       'exclusivity settled a conflict': (255, 140, 0), 'elimination (last hole, last basket)': (255, 140, 0), 'unresolved': (255, 40, 40)}
KEY = [('two signals agree (straight + spoke)', COL['two signals agree']), ('one signal', COL['one signal (spoke)']),
       ('conflict settled by exclusivity / elimination', COL['exclusivity settled a conflict']), ('unresolved / missing', COL['unresolved'])]

def text(d, xy, s, font, fill):
    x, y = xy
    for dx in (-2, -1, 0, 1, 2):
        for dy in (-2, -1, 0, 1, 2):
            if dx or dy: d.text((x + dx, y + dy), s, font=font, fill=(0, 0, 0))
    d.text((x, y), s, font=font, fill=fill)

def dashed(d, a, b, fill, width=3, dash=10):
    a, b = np.array(a, float), np.array(b, float); L = np.linalg.norm(b - a); u = (b - a) / max(L, 1e-9)
    for t in np.arange(0, L, 2 * dash): d.line([tuple(a + u * t), tuple(a + u * min(t + dash, L))], fill=fill, width=width)

def draw_course(C, R, scale=1.0):
    im = Image.fromarray(C['rgb']).convert('RGB'); d = ImageDraw.Draw(im)
    f22 = ImageFont.truetype(FB, 22); f18 = ImageFont.truetype(FB, 18)
    for h, r in R['holes'].items():
        h = int(h); res = r['resolved']; col = COL[res['how']]; t = C['tees'].get(h); b = C['badges'].get(h)
        if res['basket'] is not None:
            k = C['baskets'][res['basket']]['bp']
            if 'straight' in res['signals'] and t is not None:
                d.line([tuple(t['center']), tuple(b), tuple(k)], fill=col, width=3)
            if 'spoke' in res['signals'] and r['spoke']:
                nt = C['tees'].get(r['spoke']['toTee'])
                if nt is not None: dashed(d, k, nt['center'] + nt['u'] * C['L'] / 2, col)
            d.ellipse([k[0] - 6, k[1] - 6, k[0] + 6, k[1] + 6], outline=col, width=3)
            src = C['baskets'][res['basket']]['src']
            text(d, (k[0] + 9, k[1] - 4), f'K{h}' + (' (S4)' if src == 'S4' else ''), f22, col)
        if t is not None:
            c = t['center']; L, Wd = C['L'], C['L'] * 0.69; u = t['u']; n = np.array([-u[1], u[0]])
            poly = [tuple(c + sx * u * L / 2 + sy * n * Wd / 2) for sx, sy in ((1, 1), (1, -1), (-1, -1), (-1, 1))]
            tc = (255, 255, 255) if t['src'] == 'S3' else (0, 230, 255)
            d.polygon(poly, outline=tc, width=3)
            text(d, (c[0] - 34, c[1] + 8), f'T{h}' + ('' if t['src'] == 'S3' else ' (S4)'), f22, tc)
        elif b is not None:
            text(d, (b[0] + 34, b[1] - 34), f'T{h} MISSING', f22, COL['unresolved'])   # beside badge n, clear of neighbours' badges
    # legend
    y = 8; d.rectangle([0, 0, 470, 30 + 26 * (len(KEY) + 3)], fill=(0, 0, 0))
    text(d, (8, y), f"{C['course']}: cross-validation without ground truth", f22, (255, 255, 255)); y += 30
    for s, c in KEY: d.rectangle([10, y + 4, 30, y + 20], fill=c); text(d, (38, y), s, f18, c); y += 26
    text(d, (10, y), 'solid: tee -> badge -> basket on one line (straight)', f18, (230, 230, 230)); y += 26
    text(d, (10, y), 'dashed: basket spoke -> next hole\'s tee front', f18, (230, 230, 230)); y += 26
    text(d, (10, y), 'tee outline white = S3, cyan = S4 recovered', f18, (230, 230, 230))
    return im

def crop_sheet(C, R, im):
    f20 = ImageFont.truetype(FB, 20); tiles = []
    for h, r in R['holes'].items():
        res = r['resolved']
        if res['how'] == 'two signals agree' and C['tees'].get(int(h)) is not None: continue
        pts = [C['badges'][int(h)]] + ([C['baskets'][res['basket']]['bp']] if res['basket'] is not None else []) + ([C['tees'][int(h)]['center']] if int(h) in C['tees'] else [])
        P = np.array(pts); c = P.mean(0); span = max(260, float(np.ptp(P, 0).max()) + 120)
        box = (int(c[0] - span / 2), int(c[1] - span / 2), int(c[0] + span / 2), int(c[1] + span / 2))
        t = im.crop(box).resize((420, 420), Image.LANCZOS); d = ImageDraw.Draw(t)
        why = res['how'] + (f" via {'+'.join(res['signals'])}" if res['signals'] else '') + ('' if int(h) in C['tees'] else '; NO TEE')
        d.rectangle([0, 0, 420, 50], fill=(0, 0, 0)); text(d, (6, 2), f'Hole {h}', f20, COL[res['how']]); text(d, (6, 25), why[:46], ImageFont.truetype(FB, 16), (255, 255, 255))
        tiles.append(t)
    if not tiles: return None
    cols = 4; rows = math.ceil(len(tiles) / cols); sheet = Image.new('RGB', (cols * 424, rows * 424), 'white')
    for i, t in enumerate(tiles): sheet.paste(t, ((i % cols) * 424, (i // cols) * 424))
    return sheet

if __name__ == '__main__':
    allR = json.load(open(os.path.join(HERE, 'crossval.json')))
    for c in sys.argv[1:] or list(allR):
        C = cv.load(c); im = draw_course(C, allR[c]); im.save(os.path.join(HERE, f'{c}.jpg'), quality=88)
        s = crop_sheet(C, allR[c], im)
        if s: s.save(os.path.join(HERE, f'{c}-look.jpg'), quality=88)
        print(c, 'rendered')
