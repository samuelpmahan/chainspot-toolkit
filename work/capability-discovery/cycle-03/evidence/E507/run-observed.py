from pathlib import Path
import subprocess,time,resource,json,sys
# First argument resource sidecar; all following arguments are the exact CLI argv.
out=Path(sys.argv[1]);command=sys.argv[2:];start=time.perf_counter();run=subprocess.run(command,capture_output=True,text=True);usage=resource.getrusage(resource.RUSAGE_CHILDREN)
out.write_text(json.dumps({'schema':'E507-child-process-resource-observation@1','command':command,'elapsedSeconds':time.perf_counter()-start,'maxRssKiB':usage.ru_maxrss,'userSeconds':usage.ru_utime,'systemSeconds':usage.ru_stime,'exitCode':run.returncode,'note':'Python fresh wrapper observes one actual Node child; sidecar only, no scientific trace or allocator cause.'},indent=2)+'\n')
print(run.stdout,end='');print(run.stderr,end='',file=sys.stderr);sys.exit(run.returncode)
