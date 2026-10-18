# V1 replay commands

Run from /workspace/scratch/8528bb251845 after creating a new output directory. Actual executed output directory was discovery-cycle03/V1. The Git source extraction was performed with subprocess byte capture from git cat-file after independently resolving commit:path to the expected blob, then checking encoded SHA256 before writing the PNG.

```sh
python discovery-cycle03/D2/E507/verify-inputs.py chainspot-discovery-lab discovery-cycle03/D2/frozen-protocol.json discovery-cycle03/V1/integrity-before.json
python chainspot-discovery-lab/experiments/capability-discovery/source-pixels/stage-png.py --source discovery-cycle03/V1/HeritagePark-full.png --expected-sha256 fb77ea132dd29136905088344ed35d170057dea2135e86b06f91e672bc4b2f7f --image-id HeritagePark-full@49255331791b1245cf0f9cd699816175f94e70f2 --frame HeritagePark-full@4925533:source-pixel-centres --out discovery-cycle03/V1/staged-source.json
python discovery-cycle03/D2/E507/run-observed.py discovery-cycle03/V1/process-resources.json node discovery-cycle03/D2/E507/run-heritage.mjs chainspot-discovery-lab discovery-cycle03/V1/staged-source.json discovery-cycle03/D2/E507/request-descriptor.json discovery-cycle03/V1/receipt.json discovery-cycle03/V1/caller-resources.json
python discovery-cycle03/D2/E507/verify-inputs.py chainspot-discovery-lab discovery-cycle03/D2/frozen-protocol.json discovery-cycle03/V1/integrity-after.json
python discovery-cycle03/D2/E507/analyze-and-render.py discovery-cycle03/V1 discovery-cycle03/V1/HeritagePark-full.png discovery-cycle03/D2/frozen-protocol.json
```

Independent Python assertions, recorded in the two verification JSON reports, additionally checked the producer16-file manifest, exact descriptor mapping, PNG Git blob, full decoded and staged RGBA bytes, all75,600 crop pixels, byte equality of staged/raw receipt/figure outputs, all9rows and UNKNOWN states, and all1195prior tracked file and Git blob bytes. Resource values were excluded from deterministic equality. view_image inspected the reproduced scientific figure.
