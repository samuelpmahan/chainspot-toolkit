"""Independent R899 read-only package audit. Writes only this assigned audit directory."""
from pathlib import Path
import collections, contextlib, datetime, hashlib, json, os, re, subprocess, sys, time, traceback

OUT=Path(__file__).resolve().parent
REPO=Path('/workspace/scratch/8528bb251845/chainspot-discovery-lab')
PKG=REPO/'work/capability-discovery/cycle-04'
sha=lambda b:hashlib.sha256(b).hexdigest()
def save(name,obj):
    (OUT/name).write_text(json.dumps(obj,indent=2)+'\n')
def raw(path):return Path(path).read_bytes()
def read(path):return json.loads(raw(path))
commands=[]
def run(name,args,expected=0,cwd=REPO):
    start=datetime.datetime.now(datetime.timezone.utc).isoformat()
    p=subprocess.run(args,cwd=cwd,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'},capture_output=True)
    (OUT/(name+'.stdout.log')).write_bytes(p.stdout)
    (OUT/(name+'.stderr.log')).write_bytes(p.stderr)
    row={'name':name,'argv':list(map(str,args)),'cwd':str(cwd),'startedUtc':start,'exitCode':p.returncode,'expectedExitCode':expected,'stdoutSha256':sha(p.stdout),'stderrSha256':sha(p.stderr),'stdoutBytes':len(p.stdout),'stderrBytes':len(p.stderr)}
    commands.append(row);save('commands.json',commands)
    assert p.returncode==expected,row
    return p.stdout

def main():
    m=read(PKG/'package-manifest.json');idx=read(PKG/'administration/capture-index.json')
    assert sha(raw(PKG/'package-manifest.json'))=='2641472c9a6da112688901534ea4e9582a5e2197dce84d56ef3be9b06f97ca02'
    assert sha(raw(PKG/'SHA256SUMS'))=='afdc93282ff8c5dc55d2fa98f9fd5520774f6b66b8a6e19323a568a444387b80'
    producer=Path('/workspace/scratch/8528bb251845/discovery-cycle04/P6/E899/result.json')
    assert sha(raw(producer))=='8a464d053733efb5ce91c84ea84bbd98711dc5cf5e7fa188cffa534225c499f5'
    assert len(m['files'])==m['fileCount']==321
    assert sum(x['bytes'] for x in m['files'])==m['totalBytes']==9117203
    assert len({x['path']for x in m['files']})==321
    for r in m['files']:
        b=raw(REPO/r['path']);assert (len(b),sha(b))==(r['bytes'],r['sha256']),r
    actual={str(p.relative_to(REPO))for p in PKG.rglob('*')if p.is_file()}
    actual|={str(p.relative_to(REPO))for p in (REPO/'experiments/capability-discovery/window-evidence').rglob('*')if p.is_file()}
    assert actual=={r['path']for r in m['files']}|set(m['excluded'])
    checksum=[]
    for line in (PKG/'SHA256SUMS').read_text().splitlines():
        digest,name=line.split('  ',1);assert sha(raw(REPO/name))==digest,name;checksum.append(name)
    assert len(checksum)==322 and len(set(checksum))==322
    assert set(checksum)=={r['path']for r in m['files']}|{'work/capability-discovery/cycle-04/package-manifest.json'}
    assert len(idx['files'])==388 and len({r['original']for r in idx['files']})==388
    assert len({r['path']for r in idx['files']})==279
    by={r['original']:r for r in idx['files']};cache={};decoded=[]
    for r in idx['files']:
        b=raw(PKG/r['path'])
        if r.get('codec')=='zstd':
            assert (len(b),sha(b))==(r['storedBytes'],r['storedSha256'])
            if r['path']not in cache:
                b=subprocess.check_output(['zstd','-q','-d','-c',str(PKG/r['path'])]);cache[r['path']]=b;decoded.append(r['path'])
            else:b=cache[r['path']]
        assert (len(b),sha(b))==(r['bytes'],r['sha256']),r['original']
        cache[r['original']]=b
    assert len(decoded)==27
    def cap(name):return json.loads(cache[name])
    prior=cap('prior-tracked.json')
    assert len(prior['files'])==1646
    for r in prior['files']:
        b=raw(REPO/r['path']);assert (len(b),sha(b))==(r['bytes'],r['sha256']),r['path']
    tracked=run('git-ls-files',['git','ls-files','-z']).decode().split('\0')[:-1]
    assert set(tracked)=={r['path']for r in prior['files']}
    assert run('tracked-diff',['git','diff','--exit-code'])==b''
    head=run('git-identities',['git','rev-parse','HEAD','HEAD^{tree}']).decode().splitlines()
    assert head==['532fd7406e5b939e6d4d83cf92d12e2267bab11c','c170f6d54e6a45dd3cf376af070d89ba579e3d5b']
    status=run('git-status',['git','status','--short']).decode().splitlines()
    assert set(status)=={'?? experiments/capability-discovery/window-evidence/','?? work/capability-discovery/cycle-04/'}
    accepted={}
    for path in tracked:
        if not path.endswith('.json'):continue
        digest=sha(raw(REPO/path))
        if digest in ['d31b7a4312ac1bfc4f76bc96fc278f8acad4f49f4b04283df0faa8e6dce54626','5b59dce1c7ae87f962c0305697ed883e423bd504fedce5851fb02242309dcf52']:
            accepted[digest]={'path':path,'value':read(REPO/path)}
    save('accepted-closures-input.json',accepted)
    assert len(accepted)==2
    sf=cap('P6/E813/source-freeze.json')
    for r in sf['files']:
        b=raw(REPO/r['path']);assert (len(b),sha(b))==(r['bytes'],r['sha256'])
    assert len(sf['files'])==4
    assert sha(cache['P1/R813/result.json'])=='bf5a2be3c91748ba1f299fec7b5a4325c7ffed9b2ff54006e430b7cc4fb6c054'
    assert cap('P1/R813/result.json')['decision']=='accepted'
    old=cache['P6/E813/history-E812/group.mjs'];new=raw(REPO/'experiments/capability-discovery/window-evidence/group.mjs')
    new_labels=b"function labels(a) {\n  if(!Array.isArray(a)) return false;\n  for(let i=0;i<a.length;i++) if(!own(a,i) || !named(a[i])) return false;\n  return true;\n}"
    assert new.count(new_labels)==1
    original_labels=re.search(rb'const labels = [^\n]+',old).group()
    assert new.replace(new_labels,original_labels)==old
    assert cap('P1/R812/result.json')['decision']=='amend'
    assert cap('P1/R806/result.json')['decision']=='amend'
    auth=cache['P1/R812/counterexample.json'];bad=raw(PKG/'administration/rejected-R812-copy.json.partial.txt')
    assert (len(auth),sha(auth))==(50209,'23eb330d6395693594e0c5bfec68151a932349d2a0dc418e242fd8657c8e666e')
    assert (len(bad),sha(bad))==(35295,'cc28eeac036781b16e4cb367067d576eb63bf8e002968ed05683102657832528')
    json.loads(auth)
    try:json.loads(bad)
    except json.JSONDecodeError:pass
    else:raise AssertionError('Invalid partial unexpectedly parsed')
    save('integrity.json',{'payloadFiles':321,'checksumEntries':322,'originalBindings':388,'uniqueCapturedStorage':279,'uniqueZstdFilesDecoded':len(decoded),'priorTrackedExact':1646,'helperFreezeEntries':4,'acceptedClosures':{k:{'path':v['path']}for k,v in accepted.items()},'sourceRepairOnly':True,'R812Authoritative':{'bytes':len(auth),'sha256':sha(auth)},'quarantinedPartial':{'bytes':len(bad),'sha256':sha(bad)},'capturedIndexSha256':sha(raw(PKG/'administration/capture-index.json'))})
    run('packaged-verify',['python3',str(PKG/'verify-package.py')])
    run('focused-tests',['node','--test','--test-reporter=tap','experiments/capability-discovery/window-evidence/group.test.mjs'])
    run('stage-default',['python3',str(PKG/'stage-replay.py'),'--out',str(OUT/'stage-default')])
    run('stage-bulk',['python3',str(PKG/'stage-replay.py'),'--out',str(OUT/'stage-bulk'),'--with-bulk'])
    stages=[]
    for mode in ['stage-default','stage-bulk']:
        stage=OUT/mode;receipt=read(stage/'stage-receipt.json');comp=[]
        for r in idx['files']:
            b=raw(stage/'discovery-cycle04'/r['original']);assert (len(b),sha(b))==(r['bytes'],r['sha256'])
        for e in receipt['files']:
            if 'portable'not in e:continue
            r=by[e['original']];b=raw(stage/e['portable']);old=cache[r['original']]
            expected=old.decode().replace('/workspace/scratch/8528bb251845/discovery-cycle04',str(stage/'discovery-cycle04')).replace('/workspace/scratch/8528bb251845/chainspot-discovery-lab',str(REPO)).encode()
            assert b==expected and sha(b)==e['portableSha256'];comp.append(e['portable'])
        assert len(comp)==17
        omitted=[]
        for r in idx['omitted']:
            path=stage/'discovery-cycle04'/r['original']
            if path.exists():
                b=raw(path);assert (len(b),sha(b))==(r['bytes'],r['sha256']);omitted.append(r['original'])
        assert len(omitted)==(27 if mode=='stage-bulk'else 0)
        stages.append({'mode':mode,'originalsExact':388,'pathOnlyCompanions':17,'omittedExact':len(omitted),'reconstructedPaths':omitted,'receiptSha256':sha(raw(stage/'stage-receipt.json'))})
    save('staging-verification.json',stages)
    # Read-only replay refusal verifies it cannot replace an existing stage.
    run('stage-overwrite-refusal',['python3',str(PKG/'stage-replay.py'),'--out',str(OUT/'stage-default')],expected=1)
    results={}
    for name in ['P3/E809/receipt.json','P5/E810/receipt.json','P2/E811/receipt-A.json','P2/E811/receipt-B.json']:
        r=cap(name);branches={}
        for branch in ['composition','sourceComposition']:
            if branch not in r:continue
            ss=r[branch]['stations'];rows=[c for s in ss for c in s['candidates']]
            branches[branch]={'stationCount':len(ss),'rows':len(rows),'finiteFit':sum(c['edgeFit']is not None for c in rows),'nullFit':sum(c['edgeFit']is None for c in rows),'status':r[branch]['status'],'localWidth':r[branch].get('localWidth'),'semanticIdentity':r[branch].get('semanticIdentity'),'stations':[{'id':s['id'],'window':s['window'],'profileStationCount':s['profile']['stationCount'],'fits':[{'widthArgPx':c['widthArgPx'],'edgeFit':c['edgeFit']}for c in s['candidates']]}for s in ss]}
        results[name]={'sha256':sha(cache[name]),'status':r['status'],'execution':r.get('execution'),'equivalence':r.get('equivalence'),'branches':branches}
    assert [results['P3/E809/receipt.json']['branches'][b]['finiteFit']for b in ['composition','sourceComposition']]==[43,43]
    assert [results['P5/E810/receipt.json']['branches'][b]['finiteFit']for b in ['composition','sourceComposition']]==[41,41]
    for n in ['P3/E809/receipt.json','P5/E810/receipt.json']:
        assert sum(x['rows']for x in results[n]['branches'].values())==108
        assert results[n]['equivalence']['absoluteTolerance']==1e-9
        assert results[n]['equivalence']['differences']==[]
    assert results['P2/E811/receipt-A.json']['execution']['compositionCalls']==2
    assert len(results['P2/E811/receipt-A.json']['branches'])==2
    for b in results['P2/E811/receipt-A.json']['branches'].values():assert b['rows']==0 and all(s['profileStationCount']>0 for s in b['stations'])
    assert results['P2/E811/receipt-B.json']['execution']is None and results['P2/E811/receipt-B.json']['branches']=={}
    save('raw-receipt-inspection.json',results)
    # Parse the actual V8 function entry ranges, keeping explicit zero records distinct from missing records.
    coverage={}
    names=['runSourcePixelRoi','prepare','runComposition','lumOf','profileAt','edgePairOf','estimateFourLaneCorridorWidth','observeFourLaneCrossSection']
    for owner in ['P2/E811','P5/R811']:
        coverage[owner]={}
        for case in ['A','B']:
            paths=[n for n in by if n.startswith(owner+'/v8-coverage-'+case+'/')]
            assert len(paths)==1
            d=cap(paths[0]);rows=[]
            for script in d['result']:
                for f in script['functions']:
                    if f['functionName']in names:
                        rows.append({'name':f['functionName'],'url':script['url'],'entryRange':f['ranges'][0],'isBlockCoverage':f['isBlockCoverage']})
            assert len(rows)==8 and {x['name']for x in rows}==set(names)
            counts={x['name']:x['entryRange']['count']for x in rows}
            expected=dict(zip(names,[1,1,2,2,2,0,2,0]if case=='A'else[1,1,0,0,0,0,0,0]))
            assert counts==expected
            coverage[owner][case]={'path':paths[0],'sha256':sha(cache[paths[0]]),'counts':counts,'explicitEntries':rows}
    save('native-runtime-inspection.json',coverage)
    # Full historical TAP logs are evidence only; no broad scientific producer suite is rerun.
    def tap(name):
        text=cache[name].decode();totals={k:int(re.findall(r'^# '+k+r' (\d+)$',text,re.M)[-1])for k in ['tests','pass','fail']}
        fail=re.findall(r'^not ok \d+ - (.+)$',text,re.M)
        fail=[re.sub(r'/workspace/scratch/8528bb251845/lab4-base-check-[^/]+/','',x)for x in fail]
        fail=[x.replace(str(REPO)+'/', '') for x in fail]
        return {'path':name,'sha256':sha(cache[name]),'totals':totals,'failedNames':fail}
    baseline=tap('baseline-bare-node-tap.stdout.log');current=tap('P6/E813/repository-tests.log')
    assert baseline['totals']=={'tests':170,'pass':153,'fail':17}
    assert current['totals']=={'tests':187,'pass':170,'fail':17}
    assert baseline['failedNames']==current['failedNames'] and len(current['failedNames'])==17
    save('historical-test-log-inspection.json',{'baseline':baseline,'current':current,'fullSuiteFreshlyRerun':False,'labGate':tap('P6/E813/green-lab.log'),'focusedGate':tap('P6/E813/green-focused.log'),'redGate':tap('P6/E813/red-stdout.log'),'stagerRawLog':cache['P6/E813/stager-tests.log'].decode()})
    # Freeze all unmodified package bindings again after staging.
    for r in m['files']:
        b=raw(REPO/r['path']);assert (len(b),sha(b))==(r['bytes'],r['sha256'])
    assert sha(raw(PKG/'package-manifest.json'))=='2641472c9a6da112688901534ea4e9582a5e2197dce84d56ef3be9b06f97ca02'
    print(json.dumps({'integrity':'PASS','staging':'PASS','rawReceipts':'PASS','nativeCoverage':'PASS','historicalFullTests':'same17Failures','CVCalls':0},indent=2))

if __name__=='__main__':
    started=datetime.datetime.now(datetime.timezone.utc).isoformat()
    with (OUT/'audit.stdout.log').open('w') as stdout,(OUT/'audit.stderr.log').open('w') as stderr:
        with contextlib.redirect_stdout(stdout),contextlib.redirect_stderr(stderr):
            try:
                main();code=0
            except BaseException:
                traceback.print_exc();code=1
    save('audit-process.json',{'command':['python3',str(Path(__file__).resolve())],'startedUtc':started,'exitCode':code,'stdoutSha256':sha(raw(OUT/'audit.stdout.log')),'stderrSha256':sha(raw(OUT/'audit.stderr.log'))})
    print((OUT/'audit.stdout.log').read_text());print((OUT/'audit.stderr.log').read_text(),file=sys.stderr)
    sys.exit(code)
