"""Read-only explicit closure, raw scientific-reporting, provenance, and figure binding checks."""
from pathlib import Path
import contextlib, datetime, hashlib, json, re, subprocess, sys, traceback
from PIL import Image
OUT=Path(__file__).resolve().parent
REPO=Path('/workspace/scratch/8528bb251845/chainspot-discovery-lab')
PKG=REPO/'work/capability-discovery/cycle-04'
STAGE=OUT/'stage-default/discovery-cycle04'
FULL=OUT/'stage-bulk/discovery-cycle04'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(p):return json.loads(Path(p).read_bytes())
def cap(p):return read(STAGE/p)
def binding(p):
    b=Path(p).read_bytes();return {'path':str(p),'sha256':sha(b),'bytes':len(b)}
def save(n,v):(OUT/n).write_text(json.dumps(v,indent=2)+'\n')
def main():
    accepted=read(OUT/'accepted-closures-input.json');closures={}
    for digest,entry in accepted.items():
        v=entry['value'];rows=v['files']+v.get('retainedContractHistoryAndEvidence',[])
        if 'existingGuard'in v:rows.append(v['existingGuard'])
        for r in v.get('immutableSources',[]):rows.append({'path':'experiments/capability-discovery/probes/width/'+r['file'],'sha256':r['sha256']})
        for r in rows:assert sha((REPO/r['path']).read_bytes())==r['sha256'],r
        assert len(rows)==(23 if digest.startswith('d31b')else 14)
        closures[digest]={'manifest':entry['path'],'exactEntries':len(rows),'rows':rows}
    save('accepted-closure-verification.json',closures)
    # Read actual raw per-station rows and compare the displayed scientific points without any CV call.
    receipts={n:cap(n+'/receipt.json')for n in ['P3/E809','P5/E810']}
    details={}
    for n,r in receipts.items():
        stations={s['id']:s for s in r['composition']['stations']}
        assert r['semanticIdentity']['status']=='UNKNOWN' and r['localWidth']['status']=='UNKNOWN' and r['promoted']is False
        for branch in ['composition','sourceComposition']:
            assert r[branch]['semanticIdentity']['status']=='UNKNOWN' and r[branch]['localWidth']['status']=='UNKNOWN'
        for s in r['composition']['stations']:
            other=next(x for x in r['sourceComposition']['stations']if x['id']==s['id'])
            assert s['profile']==other['profile'] and s['candidates']==other['candidates']
        if n=='P3/E809':
            primary='proposed-ribbon';anchor=42
        else:primary='primary';anchor=56
        def row(id,width):return next(c for c in stations[id]['candidates']if c['widthArgPx']==width)
        anchorFits={id:row(id,anchor)['edgeFit']for id in stations}
        if n=='P3/E809':
            assert all(anchorFits[primary+'.'+w]is not None for w in ['short1','short2','short3','short4','short5','long'])
            assert all(anchorFits['bright-organic.'+w]is not None for w in ['short1','short2','short3','short4','short5','long'])
            assert anchorFits['lateral-plus6.short1']is None
            residual=(anchorFits[primary+'.short4']['cPx']-anchorFits['lateral-plus6.short4']['cPx'])-6
            assert abs(residual-(-8.282100436166711))<1e-12
            details[n]={'anchor':anchor,'primaryAndBrightAll6Finite':True,'shiftShort1Null':True,'shiftShort4ResidualPx':residual}
        else:
            assert anchorFits['primary.long']is not None and anchorFits['primary.short1']is None and anchorFits['primary.short3']is None and anchorFits['primary.short5']is None
            assert row('primary.long',48)['edgeFit']is not None and row('primary.short5',48)['edgeFit']is None
            assert all(anchorFits['bright-organic.'+w]is not None for w in ['short1','short2','short3','short4','short5','long'])
            details[n]={'anchors':[48,56],'longFiniteWithShortNulls':True,'bright56All6Finite':True,'profileSamples':{s['id']:{'offset0':s['profile']['offsetsPx'][0],'meanLum0':s['profile']['meanLum'][0],'min':min(s['profile']['meanLum']),'max':max(s['profile']['meanLum'])}for s in r['composition']['stations']}}
    cases=['intact','localized-upper-rail-loss','organic-capsule','crossing'];synthetic={c:cap('P4/E807/'+c+'/raw-receipt.json')for c in cases}
    assert sum(len(s['candidates'])for r in synthetic.values()for s in r['stations'])==156
    comparison=cap('P4/E807/prediction-comparison.json');assert len(comparison['checks'])==94 and all(x['pass']for x in comparison['checks'])and comparison['failedChecks']==[]
    syntheticRows={}
    for case,r in synthetic.items():
        ss={s['id']:s for s in r['stations']}
        fits={id:next(c for c in s['candidates']if c['widthArgPx']==30)['edgeFit']for id,s in ss.items()}
        assert fits['long-at-short-05']is not None
        nulls=[id for id,f in fits.items()if f is None]
        assert nulls==(['short-05','short-06']if case in ['localized-upper-rail-loss','crossing']else[])
        syntheticRows[case]={'rows':sum(len(s['candidates'])for s in r['stations']),'bank30Fits':fits}
    for a,b in zip(synthetic['intact']['stations'],synthetic['organic-capsule']['stations']):assert a['profile']==b['profile']and a['candidates']==b['candidates']
    e807log=[json.loads(x)for x in (STAGE/'P4/E807/run.stdout.log').read_text().splitlines()]
    assert sum(x.get('event')=='composition-start'for x in e807log)==4
    assert sum(x.get('event')=='composition-finished'for x in e807log)==4
    assert e807log[-1]['compositionCalls']==4 and e807log[-1]['failedChecks']==[]
    details['E807']={'compositionCallsLogged':4,'candidateRows':156,'comparisonChecks':94,'cases':syntheticRows,'capsuleProfileAndCandidateChannelsEqualIntact':True}
    # Preserve execution/replay testimony separately: audit does not rerun any of these producers or reviewers.
    reviews={}
    for n in ['P1/R807','P4/R809','P4/R810','P5/R811']:
        r=cap(n+'/result.json');assert r['decision']=='accepted'
        reviews[n]={'result':binding(STAGE/n/'result.json'),'decision':r['decision']}
    for p in ['P4/R809/replay.stdout.log','P4/R810/replay.stdout.log']:
        line=json.loads((STAGE/p).read_text().splitlines()[-1]);assert line['rows']==108 and line['adapterCalls']==1 and line['recipeCalls']==2 and line['rawReceiptByteIdentity']is True
        reviews[p]=line
    for producer,review in [('P3/E809','P4/R809'),('P5/E810','P4/R810')]:assert (STAGE/producer/'receipt.json').read_bytes()==(STAGE/review/'receipt.json').read_bytes()
    save('reporting-crosscheck.json',{'factsFromRawReceipts':details,'independentPriorReviewRecords':reviews,'CVCallsByThisAudit':0,'scienceAcceptedByThisAudit':False})
    # Exact optional pixel decoder checks independent of staged JSON checks.
    sources=read(PKG/'source-manifest.json');sourceChecks=[]
    for s in sources['sourceImages']:
        png=OUT/'stage-bulk'/('source-'+s['gitBlob']+'.png')
        assert sha(png.read_bytes())==s['pngSha256']
        with Image.open(png)as img:
            assert img.size==(s['width'],s['height'])
            rgba=img.convert('RGBA').tobytes();assert sha(rgba)==s['rgbaSha256']
        sourceChecks.append({**s,'independentPngAndRgbaVerification':True})
    save('source-pixel-verification.json',sourceChecks)
    # Frame/pixel/measurement attribution in rendered figures is checked without rendering or browser QA.
    figs=['P4/E807/E807-synthetic-window-evidence.png','P3/E809/E809-actual-receipt-display-v2.png','P5/E810/E810-actual-receipt.png','P5/E810/E810-raw-profiles.png']
    summaries=[cap('P3/E809/renderer-summary-display-v2.json'),cap('P5/E810/renderer-summary.json')]
    assert summaries[0]['receiptSha256']==sha((STAGE/'P3/E809/receipt.json').read_bytes())
    assert summaries[1]['receiptSha256']==sha((STAGE/'P5/E810/receipt.json').read_bytes())
    assert summaries[0]['figureSha256']==sha((STAGE/figs[1]).read_bytes())
    assert [x['sha256']for x in summaries[1]['figures']]==[sha((STAGE/n).read_bytes())for n in figs[2:]]
    save('figure-bindings.json',[binding(STAGE/n)for n in figs])
    # Raw failures/history are retained and current errata qualify their scope.
    assert '/usr/bin/time: No such file or directory'in (STAGE/'P3/E809/run.launch-v1.log').read_text()
    assert 'FileExistsError'in (STAGE/'P3/E809/render.log').read_text()
    assert (STAGE/'P3/E809/E809-actual-receipt.png').read_bytes()==(STAGE/'P3/E809/history-render-v1/E809-actual-receipt.png').read_bytes()
    assert 'nonoptimal_native_score'in (STAGE/'solves/epoch-11.stderr.log').read_text()
    assert '(-200, 1)'in (STAGE/'solves/epoch-11.stderr.log').read_text()
    repair=cap('solves/epoch-11.json');assert repair['dispatch']=={'P1':'R812','P4':'R809'}
    errata=cap('coordinator-errata.json');assert 'tool-transcript evidence only'in errata['events'][0]['administrativeError']
    red=cap('P6/E812/red-metadata.json');assert red['runs'][0]['ordinal']==1 and 'tool transcript'in red['runs'][0]['capture']
    # The live read is observation only, never dispatch authority; root remains its sole writer.
    live=read('/workspace/scratch/8528bb251845/discovery-cycle04/state.json')
    assert live['workers']['V1']['job']=='R899'and live['jobs']['R899']['status']=='running'
    save('native-state-observation.json',{'observedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'epoch':live['epoch'],'workers':live['workers'],'R899':live['jobs']['R899'],'E899':live['jobs']['E899'],'E900':live['jobs'].get('E900'),'authority':'Root alone; captured package states are earlier observations, not current dispatcher state.'})
    save('history-provenance-verification.json',{'E809LaunchFailure':binding(STAGE/'P3/E809/run.launch-v1.log'),'E809RefusedOverwrite':binding(STAGE/'P3/E809/render.log'),'E810ResourceClarification':binding(STAGE/'P5/E810/reporting-clarification.json'),'epoch11Rejected':binding(STAGE/'solves/epoch-11.stderr.log'),'epoch11Repaired':binding(STAGE/'solves/epoch-11-repaired.stdout.log'),'prematureStart':'Tool-transcript testimony only, no fabricated raw log','E812Red1':'Tool-transcript testimony only; red2 stdout captured','E813Red':binding(STAGE/'P6/E813/red-stdout.log'),'R806':binding(STAGE/'P1/R806/result.json'),'R812':binding(STAGE/'P1/R812/result.json'),'R813':binding(STAGE/'P1/R813/result.json')})
    print(json.dumps({'acceptedClosureEntries':[23,14],'rawFigureReporting':'matched','sourcePngAndRgba':'exact','history':'preserved-and-qualified','CVCalls':0},indent=2))
if __name__=='__main__':
    start=datetime.datetime.now(datetime.timezone.utc).isoformat()
    with (OUT/'supplement.stdout.log').open('w')as o,(OUT/'supplement.stderr.log').open('w')as e:
        with contextlib.redirect_stdout(o),contextlib.redirect_stderr(e):
            try:main();code=0
            except BaseException:traceback.print_exc();code=1
    save('supplement-process.json',{'argv':['python3',str(Path(__file__).resolve())],'startedUtc':start,'exitCode':code,'stdout':binding(OUT/'supplement.stdout.log'),'stderr':binding(OUT/'supplement.stderr.log')})
    print((OUT/'supplement.stdout.log').read_text());print((OUT/'supplement.stderr.log').read_text(),file=sys.stderr);sys.exit(code)
