# Does a straight hole's pad axis pass through its basket's tip (bottom-centre of the sprite = raster anchor)?
from ribbon import *
cal={r['tee']:r for r in json.load(open('calib3.json'))}
tips=[(i,np.array([b['bbox'][0]+(b['bbox'][2]-1)/2, b['bbox'][1]+b['bbox'][3]-1])) for i,b in enumerate(kj)]
rows=[]
for r in fit['rows']:
    k=cal[r['tee']]
    if k['widthPx']<30: continue
    phi=math.radians(r['thDeg']+k['sense']); u=np.array([math.cos(phi),math.sin(phi)]); n=np.array([-u[1],u[0]]); c=np.array([r['cx'],r['cy']])
    best=None
    for i,t in tips:
        d=t-c; along=d@u; lat=d@n
        if along<40: continue
        if best is None or abs(lat)<abs(best[2]): best=(i,along,lat)
    i,along,lat=best; ang=math.degrees(math.atan2(lat,along))
    rows.append(dict(tee=r['tee'],badge=r['badge'],basket=i,distPx=round(along,1),tipOffPx=round(lat,2),tipAngDeg=round(ang,2)))
    print(rows[-1])
json.dump(rows,open('tips.json','w'),indent=1)
