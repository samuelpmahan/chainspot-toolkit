# python3 render_adjacent.py <course> ...   Sam: "bright components adjacent to known occluders". Every S1 bright component
# that touches an opaque Part (badge, S2 basket) and is mostly owned by no Part, outlined magenta and labelled with its
# component id and area (px); next to what S4 recovered (cyan pads = recovered tees with their hole; cyan boxes = S4
# recovered baskets), so a hit can be read against what it turned out to be. Crops: one tile per hit, 6x.
import json, sys, os, glob, numpy as np
from PIL import Image, ImageDraw, ImageFont
TK = '/home/user/chainspot-toolkit'; HERE = os.path.dirname(os.path.abspath(__file__)); SP = '/tmp/claude-0/-home-user/73d91f40-13de-5bef-9b81-7de266a5102a/scratchpad'
ATT = dict(l.split() for l in open(f'{TK}/docs/evidence/dev-s1s4/ATTEMPTS'))
FB = '/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf'; f16 = ImageFont.truetype(FB, 16); f14 = ImageFont.truetype(FB, 14)
def text(d, xy, s, font, fill):
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1): d.text((xy[0] + dx, xy[1] + dy), s, font=font, fill=(0, 0, 0))
    d.text(xy, s, font=font, fill=fill)
for c in sys.argv[1:]:
    D = json.load(open(os.path.join(HERE, f'comps-{c}.json')))   # node adjacent.mjs <course> <attempt> comps-<course>.json
    out = f'{TK}/attempts/stages/{ATT[c]}/fork/stage-output'; out = f'{TK}/attempts/stages/{ATT[c]}/fork/stage-output'
    raw = np.fromfile(f'{out}/early/artifacts/s1/badgePx.rgba.bin', dtype=np.uint8); H = raw.size // 4 // 1290; rgb = raw.reshape(H, 1290, 4)[..., :3]
    run = sorted(glob.glob(f'{out}/s4recover/run-*'))[-1]
    rec = json.load(open(f'{run}/artifacts/fn.Tee.recover/greedyOccluded/recovered.json'))['recovered']
    boxes = [d['semanticBbox'] for d in json.load(open(f'{out}/basket-bridge/basket-recovery.part.json'))['comparisons']['accepted'] if d['classification'] != 'existing-s2-exact']
    tiles = []
    for r in D['rows']:
        x, y, w, h = r['bbox']; cx, cy = x + w / 2, y + h / 2; S = 6; half = max(28, int(max(w, h) / 2) + 18)
        x0, y0 = int(cx - half), int(cy - half); size = 2 * half
        im = Image.fromarray(rgb).crop((x0, y0, x0 + size, y0 + size)).resize((size * S, size * S), Image.NEAREST); d = ImageDraw.Draw(im)
        P = lambda px, py: ((px - x0) * S, (py - y0) * S)
        for i in r['px']:
            X, Y = P(i % D['W'], i // D['W']); d.rectangle([X + 1, Y + 1, X + S - 2, Y + S - 2], outline=(255, 0, 255), width=1)
        for b in boxes:
            d.rectangle([P(b[0], b[1]), P(b[0] + b[2], b[1] + b[3])], outline=(0, 230, 255), width=3)
        for t in rec:
            cs = [P(*p) for p in t['corners']]; d.polygon(cs, outline=(0, 230, 255), width=3)
            text(d, P(*t['center']), f"S4 Tee {t['hole']}", f16, (0, 230, 255))
        d.rectangle([0, 0, size * S, 40], fill=(0, 0, 0))
        text(d, (4, 2), f"{c} component {r['label']}: {r['area']} px, {r['unownedPx']} unowned", f16, (255, 0, 255))
        text(d, (4, 21), f"touches {', '.join(r['touches'])}" + ('' if r['inComponentList'] else ' (not in S1 component list)'), f14, (255, 255, 255))
        tiles.append(im.resize((360, 360), Image.LANCZOS))
    cols = 5; rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 364, rows * 364), 'white')
    for i, t in enumerate(tiles): sheet.paste(t, ((i % cols) * 364, (i // cols) * 364))
    sheet.save(os.path.join(HERE, f'{c}-adjacent.jpg'), quality=88); print(c, len(tiles), 'tiles')
