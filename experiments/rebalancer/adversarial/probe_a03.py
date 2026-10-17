"""Synthetic adversarial probes of native Rebalancer behavior; isolated from the live state."""
import argparse
import json
from pathlib import Path
from rebalancer import ProblemSolver

WORKERS = [f"W{i}" for i in range(1, 7)]


def solve_case(name, lanes, initial, capacities, pins=(), forbidden=None, affinities=(),
               expect=None, force_broken=False):
    forbidden = forbidden or {w: [] for w in WORKERS}
    solver = ProblemSolver(service_name="rebalancer-adversarial", service_scope=name)
    solver.set_object_name("worker").set_container_name("packet").set_assignment(initial)
    solver.add_scope("packets", {lane: lane for lane in lanes})
    solver.add_object_dimension("headcount", {w: 1 for w in WORKERS})
    solver.add_scope_dimension("headcount", "packets", capacities)
    solver.add_constraint({"capacitySpec": {"name": "packet_capacity", "scope": "packets", "dimension": "headcount"}})
    if pins:
        solver.add_constraint({"avoidMovingSpec": {"name": "pin_active", "objects": list(pins)}})
    blocks = [{"object": w, "scopeItems": blocked} for w, blocked in forbidden.items() if blocked]
    if blocks:
        solver.add_constraint({"avoidAssignmentsSpec": {"name": "review_independence", "scope": "packets", "assignments": blocks}})
    if affinities:
        solver.add_goal({"assignmentAffinitiesSpec": {"name": "priority", "scope": "packets", "affinities": affinities}}, 1.0, 0)
    solver.add_goal({"minimizeMovementSpec": {"name": "movement_tiebreak", "scope": "packets", "dimension": "headcount", "doNotNormalize": True}}, 1.0, 1)
    solver.add_solver({"localSearchSolverSpec": {"solveTime": 1, "stopAfterMoves": 500, "randomSeed": 13,
        "moveTypeList": [{"singleMoveTypeSpec": {}}, {"swapMoveTypeSpec": {}}]}})
    native = solver.solve()
    assignment = native["assignment"]
    initial_by_worker = {worker: lane for lane, members in initial.items() for worker in members}
    counts = {lane: sum(dest == lane for dest in assignment.values()) for lane in lanes}
    violations = []
    if native.get("finalConstraint", {}).get("brokenVal", 0) != 0:
        violations.append("native_constraints_broken")
    if any(counts[lane] > capacities[lane] for lane in lanes):
        violations.append("capacity_exceeded")
    if any(assignment[w] != initial_by_worker[w] for w in pins):
        violations.append("pin_moved")
    for worker, blocked_lanes in forbidden.items():
        if assignment[worker] in blocked_lanes:
            violations.append(f"ineligible_assignment:{worker}:{assignment[worker]}")
    # This is the wrapper dispatch gate. An invalid native assignment is never dispatched.
    dispatch = {} if violations else {w: lane for w, lane in assignment.items() if initial_by_worker[w] == "BENCH" and lane != "BENCH"}
    wrapper_rejected = bool(violations)
    case = {
        "name": name,
        "synthetic": True,
        "native_assignment": assignment,
        "native_broken_val": native.get("finalConstraint", {}).get("brokenVal"),
        "native_constraints": native.get("finalConstraint"),
        "capacity_counts": counts,
        "wrapper_dispatch": dispatch,
        "wrapper_rejected": wrapper_rejected,
        "wrapper_violations": violations,
    }
    if expect:
        case["expected_behavior"] = expect
    return case


def initial_for(assignments, lanes):
    out = {lane: [] for lane in lanes}
    for worker, lane in assignments.items():
        out[lane].append(worker)
    return out

cases = []
# (1) Six workers are all pinned. Higher-priority work remains unassigned.
lanes = ["PIN1", "PIN2", "PIN3", "PIN4", "PIN5", "PIN6", "HOT1", "HOT2", "BENCH"]
initial = initial_for(dict(zip(WORKERS, lanes[:6])), lanes)
caps = {lane: (6 if lane == "BENCH" else 1) for lane in lanes}
aff = [{"objectName": w, "scopeItemName": j, "affinity": 10000} for j in ("HOT1", "HOT2") for w in WORKERS]
cases.append(solve_case("all_pinned_priority_work", lanes, initial, caps, WORKERS, affinities=aff,
                        expect="all pins stay; high-priority pending work does not displace them"))
# (2) No ready jobs: free workers stay on the bench.
lanes = ["BENCH", "PENDING", "PIN1", "PIN2", "PIN3", "PIN4", "PIN5"]
initial = initial_for({"W1": "BENCH", "W2": "BENCH", "W3": "BENCH", "W4": "BENCH", "W5": "BENCH", "W6": "BENCH"}, lanes)
caps = {lane: (6 if lane == "BENCH" else 1) for lane in lanes}
cases.append(solve_case("no_ready_work", lanes, initial, caps, expect="all free workers remain BENCH"))
# (3) Only free worker authored the only available review, so eligibility forbids it.
lanes = ["BENCH", "REVIEW_A", "PIN1", "PIN2", "PIN3", "PIN4", "PIN5"]
initial = initial_for({"W1": "PIN1", "W2": "PIN2", "W3": "PIN3", "W4": "PIN4", "W5": "PIN5", "W6": "BENCH"}, lanes)
caps = {lane: (6 if lane == "BENCH" else 1) for lane in lanes}
forbidden = {w: (["REVIEW_A"] if w == "W6" else []) for w in WORKERS}
aff = [{"objectName": w, "scopeItemName": "REVIEW_A", "affinity": 1000} for w in WORKERS]
cases.append(solve_case("lone_author_ineligible", lanes, initial, caps, pins=WORKERS[:5], forbidden=forbidden,
                        affinities=aff, expect="W6 remains BENCH because it authored the only ready review"))
# (4) Two free authors and two own reviews; avoidAssignments must cross-assign.
lanes = ["BENCH", "REVIEW_W1", "REVIEW_W2", "PIN1", "PIN2", "PIN3", "PIN4"]
initial = initial_for({"W1": "BENCH", "W2": "BENCH", "W3": "PIN1", "W4": "PIN2", "W5": "PIN3", "W6": "PIN4"}, lanes)
caps = {lane: (6 if lane == "BENCH" else 1) for lane in lanes}
forbidden = {w: [] for w in WORKERS}
forbidden["W1"] = ["REVIEW_W1"]
forbidden["W2"] = ["REVIEW_W2"]
aff = [{"objectName": w, "scopeItemName": j, "affinity": 1000} for j in ("REVIEW_W1", "REVIEW_W2") for w in WORKERS]
cases.append(solve_case("two_reviews_cross_assign", lanes, initial, caps, pins=WORKERS[2:], forbidden=forbidden,
                        affinities=aff, expect="W1 reviews W2's packet and W2 reviews W1's packet"))
# (5) Deliberately infeasible: pinned W1 occupies a packet with max capacity zero.
# Native may return a broken result or raise. In either case, wrapper must not dispatch it.
lanes = ["PINNED_OVER_CAP", "BENCH"]
initial = initial_for({"W1": "PINNED_OVER_CAP", "W2": "BENCH", "W3": "BENCH", "W4": "BENCH", "W5": "BENCH", "W6": "BENCH"}, lanes)
caps = {"PINNED_OVER_CAP": 0, "BENCH": 6}
try:
    bad = solve_case("incompatible_pin_capacity", lanes, initial, caps, pins=["W1"],
                     expect="wrapper rejects native result if constraints are broken")
    # If native claims success with no broken constraints despite impossible cap, independently detect and reject.
    if bad["capacity_counts"]["PINNED_OVER_CAP"] > caps["PINNED_OVER_CAP"] and not bad["wrapper_rejected"]:
        bad["wrapper_rejected"] = True
        bad["wrapper_dispatch"] = {}
        bad["wrapper_violations"].append("capacity_exceeded")
    cases.append(bad)
except Exception as exc:
    cases.append({"name": "incompatible_pin_capacity", "synthetic": True, "native_exception": type(exc).__name__ + ": " + str(exc),
                  "wrapper_dispatch": {}, "wrapper_rejected": True,
                  "wrapper_violations": ["native_solve_failed_closed"],
                  "expected_behavior": "wrapper rejects native result if constraints are broken"})

report = {"job_id": "A03", "synthetic_adversarial_cases": True, "native_backend": "installed rebalancer ProblemSolver",
          "cases": cases,
          "independent_validation": "capacity counts, pinned assignments, eligibility, and native brokenVal checked outside the solver before dispatch",
          "limits": ["Synthetic micro-cases do not represent the live workload.", "Native search behavior is observed only for these cases.", "The wrapper gate is a local probe check, not a production dispatch implementation."]}


def assert_expected_cases() -> None:
    by_name = {case["name"]: case for case in cases}
    assert len(by_name) == 5, f"expected 5 adversarial cases, got {len(by_name)}"
    pinned = by_name["all_pinned_priority_work"]
    assert all(pinned["native_assignment"][f"W{i}"] == f"PIN{i}" for i in range(1, 7))
    assert not pinned["wrapper_dispatch"]
    idle = by_name["no_ready_work"]
    assert set(idle["native_assignment"].values()) == {"BENCH"} and not idle["wrapper_dispatch"]
    lone = by_name["lone_author_ineligible"]
    assert lone["native_assignment"]["W6"] == "BENCH" and not lone["wrapper_dispatch"]
    cross = by_name["two_reviews_cross_assign"]
    assert cross["wrapper_dispatch"] == {"W1": "REVIEW_W2", "W2": "REVIEW_W1"}
    impossible = by_name["incompatible_pin_capacity"]
    assert impossible["wrapper_rejected"] and not impossible["wrapper_dispatch"]
    assert impossible.get("native_exception") or impossible.get("native_broken_val", 0) != 0 or "capacity_exceeded" in impossible["wrapper_violations"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="optional path for generated JSON results")
    args = parser.parse_args()
    assert_expected_cases()
    report["expectations_verified"] = True
    payload = json.dumps(report, indent=2)
    print(payload)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
