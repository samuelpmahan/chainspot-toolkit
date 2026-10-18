# R1104 — independent preproducer review of E1104

Decision: accepted for bounded premeasurement engineering readiness of the exact protocol SHA256 `cb4d757f36ffe6721e71541d6093a48cc11e081bd10c1684746aad8249973829`. No mandatory amendment identified. This is not producer permission, scientific acceptance, or review of future F6 source.

## Evidence actually checked

Read E1104 result/protocol/inventory/testimony and all three staging scripts. Viewed the exact Lenard3/4/5 original PNGs and Lenard5 lossless inspection crop with original-detail image inspection. The Lenard5 primary [780,906] (crop [180,256]) lies visually on the pale strip left of the black6 label; [780,740] (crop [180,90]) lies on the bright road-like feature above. These are visual caller-region descriptions, not authenticated path/nonpath truth.

Independently rehashed every input artifact, resolved each staged PNG's original ref/path to its declared Git blob, compared exact Git object bytes, checked native8-bit RGB single-frame PNG IHDR, decoded using Pillow12.3.0 without image transforms, and matched all three declared full RGBA hashes. All appended alpha bytes are255. The crop's decoded pixels equal the exact integer original crop [600,650,1200,1050); its encoded digest also matches testimony. No image enhancement, output-driven profile selection, CV calculation or query occurred.

Source frame is zero-based original pixel centers, x right/y down, dimensions1290x2796. The protocol explicitly requires full-original RGBA and original coordinates for measurement; the inspection crop is not a measurement input. Keep that exact boundary, not a translated crop surrogate.

| Item | Verified result |
| --- | --- |
| Lenard5 encoded PNG | `30fa01879840deb0584ffe001fa39779998710010faeae93510dbc7a8a0abe6e`; exact blob `78a4345489a5544640859127cd79f5a06bf9f21b` |
| Lenard5 decoded RGBA | `4379abb30a5b0907aa0e1435b13e19eafe8fdd31ac57c9b8bdff4495a14fdc2a`;14427360 bytes |
| Heading / positive normal | u=[24,-5]/sqrt601; n=[5,24]/sqrt601; phi=-0.20539538918976738 |
| Offset | Exact declared primary+6n=[781.223725524672,911.8738825184256] |
| Windows | before[-24,-8), core[-8,8), after[8,24), long[-24,24); step1;16/16/16/48 stations |
| Width bank | Literal34/42/50, all retained, no calibration/selection |
| Public invocation matrix | 16 profile +48 edgePair +48 contrast +48 loss =160; unexecuted |
| Current repository | All2062 E1106 file hashes unchanged; clean036d3e1/e21271e |

## Support and masks

All16 group/window geometric envelopes are strictly within the full original's source sampling interior. The independent conservative check includes profile normal reach30, maximum loss RGB reach50 at nominal width50, and contrast normal reach28 plus along2; it even includes the upper t endpoint conservatively. The primary/masked long48 bound is approximately x[746.307,813.693],y[852.156,959.844]; bright y[686.156,793.844]; offset x[747.530,814.917],y[858.030,965.718]. No crop support or border clamp is needed.

The explicit visibility strip is deterministic at integer original-frame centers, zero elsewhere. Reviewer-memory generation of the already-frozen predicate yields:

- Uint8 row-major1290x2796,3606840 bytes.
- SHA256 `305285b7e2bc9d44dfd572caa8d39030ed1b0c2254c15967fbb9b7bff7fae609`.
-767 one bytes, inclusive nonzero bounds x765..795,y843..969.
- Frozen floating predicate matches the exact integer equivalent at every pixel: abs(24dx-5dy)<=73 and abs(5dx+24dy)<=1568, d=[x-780,y-906]. This equivalent is a review check, not a replacement protocol.
- No mask bytes or original RGBA were written/changed. The producer should retain the exact original predicate and match this additional premeasurement mask binding.

Native bilinear mask>0.01 and strict per-side visible fraction>.5 remain unchanged; the mask is caller-synthetic visibility, not detected occlusion or an observed physical gap. Null mask and explicit strip are different declarations. Native masked loss runs terminate and do not count missing visibility as visible failure or prove continuity.

## Association/falsification boundaries

The protocol earns bounded acceptance because it predeclares primary, matched supplied-heading/windows/width bright control, exact+6n control, and same-RGBA mask ablation. It requires every width and every condition/null/nonfinite/validity result, admits that no real-image interruption or pair is guaranteed, and forbids moving/retuning after observation. Supplied heading is matched between cases; visually different road orientation is not an independently matched physical ribbon direction or calibrated control.

The profile averages longitudinal samples while contrast also spans along±2. Adjacent16-station center windows are disjoint, but contrast footprints overlap near their boundaries: before[-26,-7], core[-10,9], after[6,25] (sample-center support); long[-26,25]. Do not label these independent cases or identical pixel support. Long/core and all four queries are dependent transformations of shared source pixels, as the protocol already states.

A fitted midpoint offset residual c(offset)-c(primary)+6 can be displayed only when both pairs are finite, with no new acceptance tolerance or same-edge assumption promoted to fact. Finite bright-control data challenge specificity; this one negative control's failure would not establish specificity. Historical tau8 is only the source's raw diagnostic. Missing alpha profile remains white-overlay brightness PROXY; threshold:null cannot create an overlay pass/fail. The bank is not calibrated width and no winning width may replace the complete matrix.

Path identity, physical-edge ownership, continuity/gap, alpha/renderer/AA, physical scale, geometry truth, human/scientific acceptance remain UNKNOWN; promoted=false. Lenard3-5 are exposed same-course zooms, not heldout/independent courses. Image/source byte identity authenticates content, not these latent claims. Fusion-verification influenced this review by explicitly auditing support/dependence, competing bright structures, offset association and mask ablation rather than counting channels as confidence.

## Scope still gated

The exact future default-OFF standalone PATH_QUERIES runner, cache/source closure, bounded preflight/resource/error contract, nonfinite/typed serialization, actual trace/timing, tests and producer remain separate root admission/source freeze/review gates. Preserve the160-call matrix when this protocol is admitted: the profile is once per group/window, not once per width, though edgePair recomputes its own native profile. Do not silently turn it into192 calls.

F6 is independent of F2's staging/geometry production, but is eventual implementation owner and cannot self-review that code. Root alone owns native finish/state and connected publication. No coordinator mutation, API/CV query, producer replay, test run, product import, source/Git mutation, PR/main/deploy/defaultON action occurred here.

Reproduce only the read-only checks: `PYTHONDONTWRITEBYTECODE=1 python3 /workspace/scratch/8528bb251845/discovery-cycle05/F6/R1104/verify-review.py`. This script writes stdout only; its retained JSON and this review are separate scratch artifacts.
