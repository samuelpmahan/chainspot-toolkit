"""E807 receipt-only PNG and HTML inspection. Imports no CV/fixture code."""
import base64, hashlib, html, json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parent
def read_checked(binding):
    raw=(ROOT/binding['path']).read_bytes()
    if hashlib.sha256(raw).hexdigest()!=binding['sha256']: raise ValueError('receipt binding mismatch: '+binding['path'])
    return json.loads(raw)
run=json.loads((ROOT/'run.json').read_text())
comparison=read_checked(run['comparison'])
fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def font(n):
    try: return ImageFont.truetype(fontpath,n)
    except OSError: return ImageFont.load_default(size=n)
F=font(18);SM=font(14);TITLE=font(27);HEAD=font(21)
im=Image.new('RGB',(1660,1840),'#f6f8fa');d=ImageDraw.Draw(im)
d.text((28,20),'E807 | long averages versus ordered short windows',font=TITLE,fill='#15312e')
d.text((28,61),'Exact frozen E804 opaque synthetic pixels. Receipt-only display; no CV recomputation.',font=F,fill='#324b48')
d.text((28,88),'Candidate argument 30 px below is NOT calibrated width. Null stays null. Identity / edge continuity UNKNOWN.',font=F,fill='#8b3030')
palette={'long-at-short-05':'#125f64','short-05':'#bb3a39','short-06':'#df8a22'}
blocks=[]
def shown(v):
    if v is None:return 'null'
    if isinstance(v,(float,int)):return f'{v:.4f}'
    return str(v)
for index,case in enumerate(run['cases']):
    receipt=read_checked(case['receipt']);binding=read_checked(case['binding']);y=132+index*400
    d.rounded_rectangle((20,y,1640,y+384),radius=8,fill='white',outline='#c9d5d1')
    d.text((36,y+10),case['id'],font=HEAD,fill='#15312e')
    d.text((36,y+39),'RGBA '+binding['rgbaSha256'][:20]+'... | exact region x48..335, y128..207',font=SM,fill='#49615c')
    region=binding['sourceRegion'];pixels=base64.b64decode(region['rgbaBase64'])
    if hashlib.sha256(pixels).hexdigest()!=region['sha256']:raise ValueError('display region mismatch')
    src=Image.frombytes('RGBA',(region['widthPx'],region['heightPx']),pixels).convert('RGB').resize((576,160),Image.Resampling.NEAREST)
    im.paste(src,(36,y+64));d.rectangle((36,y+64,612,y+224),outline='#9aaba5')
    # Coordinates are frozen input geometry, not fitted centers.
    for station in binding['geometry']['stations'][1:]:
        xx=36+(station['xPx']-48)*2
        d.line((xx,y+64,xx,y+70),fill='#4ba994',width=2)
    d.text((36,y+229),'Source bytes shown 2x nearest for legibility; ticks = fixed short origins.',font=SM,fill='#49615c')
    d.text((36,y+251),'Raw profiles: long teal; short05 red; short06 orange',font=SM,fill='#15312e')
    px,py,pw,ph=36,y+275,576,83
    d.rectangle((px,py,px+pw,py+ph),fill='#eef3f2',outline='#c9d5d1')
    for level in [100,145]:
        yy=py+ph-(level-95)/55*ph;d.line((px,yy,px+pw,yy),fill='#d2dfdb');d.text((px+4,yy-13),str(level),font=SM,fill='#49615c')
    for sid,color in palette.items():
        station=next(s for s in receipt['stations'] if s['id']==sid)
        points=[(px+(o+30)/60*pw,py+ph-(v-95)/55*ph) for o,v in zip(station['profile']['offsetsPx'],station['profile']['meanLum']) if isinstance(v,(float,int))]
        if len(points)>1:d.line(points,fill=color,width=2)
    d.text((px,py+ph+2),'-30 normal px',font=SM,fill='#49615c');d.text((px+477,py+ph+2),'+30 px',font=SM,fill='#49615c')
    tx=640;d.text((tx,y+42),'Exact raw bank30 fit channels (same labels as TSV)',font=SM,fill='#15312e')
    widths=[190,50,96,96,96,96,96,110];heads=['station','nT','lPx','rPx','cPx','wPx','score','fit / midpoint']
    xx=tx
    for h,w in zip(heads,widths):d.text((xx,y+67),h,font=SM,fill='#15312e');xx+=w
    for j,s in enumerate(receipt['stations']):
        c=next(c for c in s['candidates'] if c['widthArgPx']==30);e=c['edgeFit'];yy=y+90+j*20
        color='#a43b35' if e is None else '#15312e'
        values=[s['id'],s['profile']['stationCount'],*[shown(e[k]) if e else 'null' for k in ['lPx','rPx','cPx','wPx','score']], 'null / UNKNOWN' if e is None else 'finite / observed']
        xx=tx
        for v,w in zip(values,widths):d.text((xx,yy),str(v),font=SM,fill=color);xx+=w
    d.text((640,y+357),'All 3 widths retained in raw receipts + all156-candidate-rows.tsv; table rounds display only.',font=SM,fill='#49615c')
    blocks.append('<section><h2>'+html.escape(case['id'])+'</h2><p>Raw receipt SHA256 '+case['receipt']['sha256']+'</p><details><summary>Complete raw receipt (all widths, raw profiles/counts/learner)</summary><pre>'+html.escape(json.dumps(receipt,indent=2))+'</pre></details></section>')
d.text((28,1740),'Frozen predictions matched: '+str(comparison['allLiteralPredictionsMatched'])+' | failed checks: '+str(len(comparison['failedChecks'])),font=F,fill='#15312e')
d.text((28,1770),'Capsule equals intact on retained CV channels: semantic ambiguity remains. Crossing/gap nulls do not resolve ownership.',font=F,fill='#8b3030')
d.text((28,1800),'No self-acceptance. Independent technical review pending. No alpha, AA, tracking, calibration or course generalization.',font=F,fill='#49615c')
png=ROOT/'E807-synthetic-window-evidence.png'
if png.exists():raise FileExistsError('retain first render; no overwrite')
im.save(png)
page='<!doctype html><meta charset="utf-8"><title>E807 receipt inspection</title><style>body{font:16px system-ui;max-width:1600px;margin:24px auto}img{width:100%}pre{white-space:pre-wrap;max-height:600px;overflow:auto}</style><h1>E807 synthetic receipt inspection</h1><p>Receipt-only display. Width and identity UNKNOWN. No self-acceptance. Full candidate TSV retains all156 rows.</p><img src="E807-synthetic-window-evidence.png" alt="Four synthetic controls with raw long/short fits and nulls">'+''.join(blocks)+'<h2>Literal predeclared comparison</h2><pre>'+html.escape(json.dumps(comparison,indent=2))+'</pre>'
(ROOT/'inspection.html').write_text(page)
artifacts=[]
for p in [png,ROOT/'inspection.html']:
    raw=p.read_bytes();artifacts.append({'path':p.name,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
(ROOT/'render-binding.json').write_text(json.dumps({'schema':'E807-receipt-render@1','inputs':{'run.json':hashlib.sha256((ROOT/'run.json').read_bytes()).hexdigest(),'prediction-comparison.json':run['comparison']['sha256']},'rendererSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'cvImports':0,'cvCalls':0,'displayOnly':'Pixel-region copy/nearest display; raw vector lines and rounded raw table fields. No fitted score or CV recomputation.','artifacts':artifacts},indent=2)+'\n')
print(json.dumps({'event':'receipt-only-rendered','artifacts':artifacts}))
