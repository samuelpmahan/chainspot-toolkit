# python3 render.py occ-<course>.json ...   One page per missing tee: every occluder that can hide its pad.
#   thin white circles: this course's tee->badge distance range around badge n
#   grey dots: centres where the pad is hidden enough and nothing visible contradicts it (occlusion only)
#   green dots: those that also see hallway between the pad front and the badge (edge step >= 12 lum)
#   per occluder: its box, its candidate name (Basket cX until a hole proves it; badges by their read label), the pad at its feasible centroid
#   pointing at the badge, the segment to the badge, and the hallway edge step along it (lum)
#   yellow cross: Sam's tee point where testimony exists
import json, sys, os, glob, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
TK = '/home/user/chainspot-toolkit'; HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, f'{TK}/docs/evidence/crossval'); import crossval as cv
FB = '/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf'; f20 = ImageFont.truetype(FB, 20); f16 = ImageFont.truetype(FB, 16)
CV = json.load(open(f'{TK}/docs/evidence/crossval/crossval.json'))
def text(d, xy, s, font, fill):
    for dx in (-2, 0, 2):
        for dy in (-2, 0, 2): d.text((xy[0] + dx, xy[1] + dy), s, font=font, fill=(0, 0, 0))
    d.text(xy, s, font=font, fill=fill)
PAL = [(255, 80, 80), (80, 160, 255), (255, 160, 0), (200, 90, 255), (0, 220, 220), (255, 90, 200), (180, 255, 90), (255, 255, 120)]
for f in sys.argv[1:]:
    D = json.load(open(f)); c = D['course']; C = cv.load(c)
    kname = {}
    for h, r in CV[c]['holes'].items():
        if r['resolved']['basket'] is not None: kname[tuple(C['baskets'][r['resolved']['basket']]['bbox'])] = f'K{h}'
    for h, v in D['holes'].items():
        plate = np.array(v['plate']); lo, hi = v['distanceRangePx']; S = 3
        x0, y0 = int(plate[0] - hi - 40), int(plate[1] - hi - 40); size = int(2 * hi + 80)
        im = Image.fromarray(C['rgb']).crop((x0, y0, x0 + size, y0 + size)).resize((size * S, size * S), Image.LANCZOS); d = ImageDraw.Draw(im)
        P = lambda p: ((p[0] - x0 + 0.5) * S, (p[1] - y0 + 0.5) * S)
        for R in (lo, hi):
            cx, cy = P(plate); d.ellipse([cx - R * S, cy - R * S, cx + R * S, cy + R * S], outline=(255, 255, 255), width=1)
        L, Wd = D['tpl']['L'], D['tpl']['W']
        for i, r in enumerate(v['regions']):
            col = PAL[i % len(PAL)]; bx, by, bw, bh = r['bbox']
            name = r['occluder']
            d.rectangle([P((bx, by)), P((bx + bw, by + bh))], outline=col, width=3)
            for p in r['centers'][::2]: X, Y = P(p); d.point((X, Y), fill=(170, 170, 170))
            for p in r['hallwayCenters']: X, Y = P(p); d.ellipse([X - 3, Y - 3, X + 3, Y + 3], fill=(40, 255, 60))
            cen = np.array(r['centroid']); u = (plate - cen) / np.linalg.norm(plate - cen); n = np.array([-u[1], u[0]])
            poly = [P(cen + sx * u * L / 2 + sy * n * Wd / 2) for sx, sy in ((1, 1), (1, -1), (-1, -1), (-1, 1))]
            d.polygon(poly, outline=col, width=3); d.line([P(cen + u * L / 2), P(plate)], fill=col, width=2)
            step = r['stepAtCentroid']
            text(d, (P((bx, by))[0], P((bx, by))[1] - 44), name, f20, col)
            text(d, (P((bx, by))[0], P((bx, by))[1] - 22), f"{r['feasibleCenters']} hidden fits, {len(r['hallwayCenters'])} w/ hallway; step {'-' if step is None else round(step)}", f16, col)
        if c in cv.DY:
            ann = json.load(open(glob.glob(f'{TK}/testimony/{c}/*.annotation.json')[0]))
            hm = {m['annotationNumber']: m['holeNumber'] for m in json.load(open(f'{TK}/testimony/{c}/hole-numbers.json'))['map']} if os.path.exists(f'{TK}/testimony/{c}/hole-numbers.json') else None
            for a in ann['holes']:
                if (hm[a['number']] if hm else a['number']) == int(h):
                    X, Y = P((a['tee']['xPx'], a['tee']['yPx'] - cv.DY[c])); d.line([X - 14, Y, X + 14, Y], fill=(255, 255, 0), width=4); d.line([X, Y - 14, X, Y + 14], fill=(255, 255, 0), width=4)
                    text(d, (X + 10, Y + 8), "Sam's tee", f16, (255, 255, 0))
        d.rectangle([0, 0, size * S, 54], fill=(0, 0, 0))
        text(d, (8, 4), f"{c}: Tee {h} not visible - every occluder that can hide it ({len(v['regions'])}); hallway W {round(D['hallway']['widthPx'], 1)} px", f20, (255, 255, 255))
        text(d, (8, 28), 'grey: hidden, nothing contradicts | green: + hallway between pad and badge | line: pad -> badge', f16, (220, 220, 220))
        im.save(os.path.join(HERE, f'{c}-tee{h}.jpg'), quality=88); print(c, h, im.size)
