
def f($key): .[2][] | select(.[0] == $key) | .[1];
def scalar:
  if .[0] == "null" then null
  elif .[0] == "number" and .[1] == "finite" then .[2]
  elif .[0] == "string" or .[0] == "boolean" then .[1]
  else error("non-scalar metadata") end;
def obj: .[2] | map({key:.[0],value:(.[1]|scalar)}) | from_entries;
. as $report |
(f("comparison")) as $c |
($c|f("hashes")|.[1]|map(obj)) as $hashes |
($c|f("checks")|.[1]|map(obj)) as $checks |
($c|f("timingLeaves")|.[1]|map(obj)) as $leaves |
"/workspace/scratch/8528bb251845/discovery-cycle06/G5/E1510/producer-v1" as $left |
"/workspace/scratch/8528bb251845/discovery-cycle06/V1/E1521/replay-v1" as $right |
[$hashes[]|select(.root == $left)] as $lh |
[$hashes[]|select(.root == $right)] as $rh |
(["value-trace.json"] + [range(0;160)|"fragments/answer-\(.).json"]) as $exact |
([range(0;160)|"fragments/answer-\(.).json"] + [range(0;176)|"fragments/calculation-\(.).json"] + ["value-trace.json","timing-sidecar.json"]) as $artifacts |
[$exact[] as $p | [$lh[]|select(.path == $p)] as $l | [$rh[]|select(.path == $p)] as $r |
 {path:$p,leftCount:($l|length),rightCount:($r|length),sameBytes:($l[0].bytes == $r[0].bytes),sameSha256:($l[0].sha256 == $r[0].sha256)}] as $pairs |
([range(0;182) as $i|["start","end","elapsed"][] as $k|{file:"timing-sidecar.json",pointer:"/intervals/\($i)/\($k)"}] +
 [range(0;176) as $j|{file:"timing-sidecar.json",pointer:"/calculationLog/\($j)/nativeEntry/elapsedMs"}] +
 [range(0;176) as $j|{file:"fragments/calculation-\($j).json",pointer:"/nativeEntry/elapsedMs"}]) as $expected |
{
 schema:"E1525-report-metadata-verification@1",
 authority:"Read only the already written lossless tagged comparison report; no comparator rerun, product import, or original wire decode",
 status:($report|f("status")|scalar),
 comparisonStatus:($c|f("status")|scalar),
 checks:$checks,
 allSevenComparatorChecksPass:(($checks|length)==7 and all($checks[];.status=="PASS")),
 boundRowsPerRun:{original:($lh|length),replay:($rh|length)},
 boundArtifactFilesPerRun:{original:([$lh[]|.path as $p|select(($artifacts|index($p))!=null)]|length),replay:([$rh[]|.path as $p|select(($artifacts|index($p))!=null)]|length)},
 everyFixedArtifactBoundExactlyOnce:(all($artifacts[];. as $p|([$lh[]|select(.path==$p)]|length)==1 and ([$rh[]|select(.path==$p)]|length)==1)),
 exactNonTimingFiles:($pairs|length),
 exactNonTimingAnswerFragments:(($exact|length)-1),
 everyExactNonTimingPairHasSameBytesAndSha256:all($pairs[];.leftCount==1 and .rightCount==1 and .sameBytes and .sameSha256),
 comparatorActuallyPassedExactByteStage:(([$checks[]|select(.check=="value and answer exact bytes/trees" and .status=="PASS")]|length)==1),
 timingLeafRecords:($leaves|length),
 timingLeavesActuallyVaried:([$leaves[]|select(.left!=.right)]|length),
 sidecarTimingLeavesActuallyVaried:([$leaves[]|select(.file=="timing-sidecar.json" and .left!=.right)]|length),
 intervalTimingLeavesActuallyVaried:([$leaves[]|select(.file=="timing-sidecar.json" and (.pointer|startswith("/intervals/")) and .left!=.right)]|length),
 sidecarNativeElapsedLeavesActuallyVaried:([$leaves[]|select(.file=="timing-sidecar.json" and (.pointer|startswith("/calculationLog/")) and .left!=.right)]|length),
 calculationFragmentElapsedLeavesActuallyVaried:([$leaves[]|select(.file!="timing-sidecar.json" and .left!=.right)]|length),
 sidecarTimingLeaves:([$leaves[]|select(.file=="timing-sidecar.json")]|length),
 intervalTimingLeaves:([$leaves[]|select(.file=="timing-sidecar.json" and (.pointer|startswith("/intervals/")))]|length),
 sidecarNativeElapsedLeaves:([$leaves[]|select(.file=="timing-sidecar.json" and (.pointer|startswith("/calculationLog/")))]|length),
 calculationFragmentElapsedLeaves:([$leaves[]|select(.file!="timing-sidecar.json")]|length),
 exactWhitelistPointersEachOnce:(($leaves|length)==($expected|length) and all($expected[];. as $e|([$leaves[]|select(.file==$e.file and .pointer==$e.pointer)]|length)==1)),
 retainedRawTimingRuns:($c|f("rawTiming")|.[1]|map(. as $r|{root:($r|f("root")|scalar),intervals:($r|f("intervals")|.[1]|length),calculationEntries:($r|f("calculationLog")|.[1]|length)})),
 firstDifference:($c|f("firstDifference")|scalar),
 exactValueTraceBinding:{original:($lh[]|select(.path=="value-trace.json")),replay:($rh[]|select(.path=="value-trace.json"))},
 adapterLabels:($report|f("authority")|f("argvAdapter")|.[1]|map(f("label")|scalar)),
 originalPolicyPassedUnchanged:($report|f("authority")|f("originalPolicyPassedUnchanged")|scalar),
 scientificAcceptance:"UNKNOWN",humanAcceptance:"UNKNOWN"
}
