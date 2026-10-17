"""Render recorded geometry and measurements; never runs computer vision."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'artifacts/recovered-pad-fit-20260927'
ZOOM = 6
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
SMALL = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)

def panel(source, bounds, corners=None, pixels=None):
    x0,y0,x1,y1=bounds
    tile=source.crop(bounds).resize(((x1-x0)*ZOOM,(y1-y0)*ZOOM),Image.Resampling.NEAREST)
    d=ImageDraw.Draw(tile,'RGBA')
    if pixels:
        for x,y in pixels:
            d.rectangle(((x-x0)*ZOOM,(y-y0)*ZOOM,(x-x0+1)*ZOOM-1,(y-y0+1)*ZOOM-1),
                        outline=(255,40,50,225),width=2)
    if corners:
        pts=[((x-x0)*ZOOM,(y-y0)*ZOOM) for x,y in corners]
        d.line(pts+[pts[0]],fill=(0,235,245,250),width=2)
    return tile

for name in ('AlexClark-original','IMG_5641'):
    receipt=json.loads((OUT/f'{name}-comparison.json').read_text())
    gateway=json.loads((OUT/f'{name}-gateway.json').read_text())
    assert gateway['sourceSha256']==receipt['source']['sha256'] and gateway['paramsHash']==receipt['paramsHash']
    executed={r['teeId']:r for r in gateway['runs']['ON']['candidate']['entries']}
    assert set(executed)=={r['teeId'] for r in receipt['rows']}
    assert len(gateway['runs']['ON']['candidate']['noFit'])==len(receipt['negativeControl'])
    for row in receipt['rows']:
        candidate=executed[row['teeId']]
        assert candidate['resultRef']==row['resultRef'] and candidate['sourceSha256']==receipt['source']['sha256']
        assert all(abs(a-b)<1e-9 for p,q in zip(candidate['corners'],row['constrainedSupportCorners']) for a,b in zip(p,q))
        row['constrainedSupportCorners']=candidate['corners']  # actual gateway output Part
    source=Image.open(ROOT/receipt['source']['path']).convert('RGB')
    assert source.size==(receipt['source']['frame']['widthPx'],receipt['source']['frame']['heightPx'])
    rows=receipt['rows']
    layouts=[]
    for r in rows:
        points=r['baselineCorners']+r['constrainedSupportCorners']+r['pixels']
        bounds=(int(min(p[0] for p in points))-8,int(min(p[1] for p in points))-8,
                int(max(p[0] for p in points))+9,int(max(p[1] for p in points))+9)
        pics=[panel(source,bounds),panel(source,bounds,r['baselineCorners']),
              panel(source,bounds,r['constrainedSupportCorners']),panel(source,bounds,pixels=r['pixels'])]
        layouts.append((r,pics))
    pw=max(p.width for _,pics in layouts for p in pics)
    ph=max(p.height for _,pics in layouts for p in pics)
    heading=82; footer=34
    sheet=Image.new('RGB',(4*pw,len(layouts)*(ph+heading+footer)),(14,21,29))
    draw=ImageDraw.Draw(sheet)
    for i,(row,pics) in enumerate(layouts):
        y=i*(ph+heading+footer)
        title=f"{name} H{row['holeRead']}  {row['teeId']}  selected={row['pixelCount']}  {row['source']}"
        draw.text((8,y+5),title,fill='white',font=FONT)
        metrics=f"Hollow-band baseline {row['baseline']['bandExplained']}/{row['pixelCount']}  |  support {row['constrainedSupport']['bandExplained']}/{row['pixelCount']}  (stroke {row['supportThicknessPx']:.2f}px + tolerance 1.25px)"
        draw.text((8,y+29),metrics,fill=(200,224,235),font=SMALL)
        outer=f"Finite perimeter <=1.25px baseline {row['baseline']['finitePerimeterWithin1_25']} / support {row['constrainedSupport']['finitePerimeterWithin1_25']} (separate diagnostic)"
        draw.text((8,y+50),outer,fill=(175,205,220),font=SMALL)
        for j,(label,pic) in enumerate(zip(('SOURCE PIXELS','EMITTED PCA OR FIT','EXISTING SUPPORT FIT','SELECTED BRIGHT PIXEL OUTLINES'),pics)):
            x=j*pw;sheet.paste(pic,(x,y+heading));draw.text((x+5,y+heading+ph+5),label,fill=(210,230,235),font=SMALL)
    dest=OUT/f'{name}-comparison.png';sheet.save(dest)
    print(dest, sheet.size)

# Focus comparison is compact enough for a one-glance review of both reported defects.
focus=[]
for name,hole in [('AlexClark-original','11'),('IMG_5641','12')]:
    receipt=json.loads((OUT/f'{name}-comparison.json').read_text())
    gateway=json.loads((OUT/f'{name}-gateway.json').read_text())
    row=next(r for r in receipt['rows'] if r['holeRead']==hole)
    candidate=next(r for r in gateway['runs']['ON']['candidate']['entries'] if r['teeId']==row['teeId'])
    assert candidate['resultRef']==row['resultRef']
    assert all(abs(a-b)<1e-9 for p,q in zip(candidate['corners'],row['constrainedSupportCorners']) for a,b in zip(p,q))
    row['constrainedSupportCorners']=candidate['corners']
    source=Image.open(ROOT/receipt['source']['path']).convert('RGB')
    pts=row['baselineCorners']+row['constrainedSupportCorners']+row['pixels']
    bounds=(int(min(p[0] for p in pts))-8,int(min(p[1] for p in pts))-8,
            int(max(p[0] for p in pts))+9,int(max(p[1] for p in pts))+9)
    focus.append((name,row,[panel(source,bounds),panel(source,bounds,row['baselineCorners']),
                            panel(source,bounds,row['constrainedSupportCorners']),panel(source,bounds,pixels=row['pixels'])]))
pw=max(p.width for _,_,pics in focus for p in pics);ph=max(p.height for _,_,pics in focus for p in pics)
sheet=Image.new('RGB',(4*pw,2*(ph+92)),(14,21,29));d=ImageDraw.Draw(sheet)
for i,(name,row,pics) in enumerate(focus):
    y=i*(ph+92);d.text((5,y+5),f"{name} H{row['holeRead']}  {row['pixelCount']} exact selected cells",fill='white',font=FONT)
    d.text((5,y+28),f"Hollow band: before {row['baseline']['bandExplained']}/{row['pixelCount']}; support {row['constrainedSupport']['bandExplained']}/{row['pixelCount']}",fill=(210,230,235),font=SMALL)
    d.text((5,y+47),f"Finite perimeter <=1.25px: before {row['baseline']['finitePerimeterWithin1_25']}; support {row['constrainedSupport']['finitePerimeterWithin1_25']}",fill=(210,230,235),font=SMALL)
    for j,(label,pic) in enumerate(zip(('SOURCE','EMITTED OUTLINE','EXISTING SUPPORT OUTLINE','SELECTED PIXELS'),pics)):
        x=j*pw;sheet.paste(pic,(x,y+67));d.text((x+4,y+67+ph+4),label,fill='white',font=SMALL)
sheet.save(OUT/'focus-H11-H12.png')
