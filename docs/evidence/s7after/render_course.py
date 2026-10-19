# Render a course's traces against Sam's corridors: Sam's tee->bends->basket polyline (yellow, corridor half-width band),
# our trace (green = agrees with Sam, red = not), bends as dots, hole labels; full course plus per-hole crops.
import sys, json, numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, sys.argv[0].rsplit('/', 1)[0])
import after_s4, course
name = sys.argv[1]; tag = sys.argv[2] if len(sys.argv) > 2 else 'endpoints'; res = json.load(open(f'{tag}-{name}.json'))
C = course.Course(name); f, dy = course.TESTIMONY[name]
sam = {h['number']: h for h in json.load(open(f'{after_s4.TK}/testimony/{f}'))['holes']}
P = lambda q: (q['xPx'], q['yPx'] + dy)
img = Image.fromarray(C.rgb.astype(np.uint8)).convert('RGB'); S = 2
img = img.resize((img.width * S, img.height * S), Image.LANCZOS); d = ImageDraw.Draw(img, 'RGBA')
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except Exception: font = ImageFont.load_default()
W = res['width']
for n, h in sam.items():
    pts = [P(h['tee'])] + [P(q) for q in (h.get('corridorBends') or [])] + [P(h['basket'])]
    pp = [(x * S, y * S) for x, y in pts]
    d.line(pp, fill=(255, 225, 0, 70), width=int(W * S)); d.line(pp, fill=(255, 225, 0, 255), width=3)
    for x, y in pp[1:-1]: d.ellipse([x - 7, y - 7, x + 7, y + 7], outline=(255, 225, 0, 255), width=3)
J = res['judge'] or {}
for r in res['holes']:
    n = r['hole']; j = J.get(str(n)) or J.get(n) or {}; ok = j.get('ok')
    col = (40, 220, 90, 255) if ok else (255, 50, 50, 255)
    V = r.get('verts')
    if V and r.get('end') is not None:
        pp = [(x * S, y * S) for x, y in V]; d.line(pp, fill=col, width=4)
        for x, y in pp[1:-1]: d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=col)
    t = sam.get(n); x, y = P(t['tee']) if t else C.badges[n]
    d.text((x * S + 10, y * S - 30), f"{n}{'' if ok else ' X'}", fill=col, font=font, stroke_width=3, stroke_fill=(0, 0, 0, 255))
d.rectangle([10, 10, 760, 120], fill=(0, 0, 0, 190))
d.text((20, 16), f"{name}: our trace (green agrees with Sam, red not) over Sam's corridor (yellow, band = hallway width {W:.1f} px)", fill=(255, 255, 255, 255), font=ImageFont.load_default())
d.text((20, 40), f"agreement {sum(1 for j in J.values() if j.get('ok'))}/{len(J)}; dots = bends (yellow Sam's, green/red ours); X = disagrees", fill=(255, 255, 255, 255), font=ImageFont.load_default())
img.save(f'{tag}-{name}-traces.png'); img.resize((img.width // 2, img.height // 2), Image.LANCZOS).save(f'{tag}-{name}-traces-small.png')
print('wrote', f'{tag}-{name}-traces.png')
