from ribbon import *
rows=[]
for r in fit['rows']:
    c=np.array([r['cx'],r['cy']]); res=[]
    for sense in (0,180):
        a=math.radians(r['thDeg']+sense); u=np.array([math.cos(a),math.sin(a)])
        pts=profile_pts(c,u,L/2+4,75,half=20)
        if len(pts)<10: continue
        m,d,P,rr=line_fit(c,u,pts)
        res.append((np.median(np.abs(rr)),sense,m,d,pts,rr))
    res.sort(key=lambda z:z[0]); med,sense,m,d,pts,rr=res[0]
    lat=float((c-m)@np.array([-d[1],d[0]])); pd=math.degrees(math.atan2(d[1],d[0])); ax=abs((pd-r['thDeg']+90)%180-90)
    # behind the pad: is ribbon visible? excess brightness on axis behind back edge vs sides
    u=-d; beh=[]
    for t in np.arange(L/2+1,L/2+15,1.0):
        q=c+u*t; n=np.array([-u[1],u[0]])
        on=samp(lum,q[0]+n[0]*np.arange(-5,5.1,1),q[1]+n[1]*np.arange(-5,5.1,1)).mean(); sd=samp(lum,q[0]+n[0]*np.r_[-22,-20,20,22],q[1]+n[1]*np.r_[-22,-20,20,22]).mean()
        beh.append(on-sd)
    fwd=[]
    for t in np.arange(L/2+1,L/2+15,1.0):
        q=c+d*t; n=np.array([-d[1],d[0]])
        on=samp(lum,q[0]+n[0]*np.arange(-5,5.1,1),q[1]+n[1]*np.arange(-5,5.1,1)).mean(); sd=samp(lum,q[0]+n[0]*np.r_[-22,-20,20,22],q[1]+n[1]*np.r_[-22,-20,20,22]).mean()
        fwd.append(on-sd)
    rows.append(dict(tee=r['tee'],latPx=round(lat,2),axisDeg=round(ax,2),residMedPx=round(float(med),2),widthPx=round(float(np.median(pts[:,2])),1),n=len(pts),fwdExcess=round(float(np.mean(fwd)),1),behindExcess=round(float(np.mean(beh)),1)))
    print(rows[-1])
json.dump(rows,open('calib2.json','w'),indent=1)
