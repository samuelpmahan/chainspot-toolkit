"""Run paired dynamic/fixed native-Rebalancer experiments with local workers.

All run directories retain their input spec, coordinator artifacts, receipts,
and compact benchmark-run.json summary so results can be inspected or replayed.
"""
from __future__ import annotations

import argparse
import ast
import copy
import datetime as dt
import json
import math
import os
import pathlib
import statistics
import sys
import time
from typing import Any


POLICIES = ("dynamic", "fixed", "fixed_tuned")
MAX_NATIVE_SCORE_SESSIONS = 3


def read_json(path: pathlib.Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: pathlib.Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_json_once(path: pathlib.Path, value: Any) -> None:
    """Durably publish a JSON record without replacing an existing record."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{os.getpid()}.{time.time_ns()}.tmp")
    try:
        with temp.open("x", encoding="utf-8") as stream:
            json.dump(value, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temp, path)
        try:
            directory_fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            pass
    finally:
        temp.unlink(missing_ok=True)


def _native_score_rejection(error: RuntimeError) -> list[str] | None:
    prefix = "native assignment rejected before dispatch: "
    message = str(error)
    if not message.startswith(prefix):
        return None
    try:
        reasons = ast.literal_eval(message[len(prefix):])
    except (ValueError, SyntaxError):
        return None
    if reasons == ["nonoptimal_native_score"]:
        return reasons
    return None


def tuned_roles(spec: dict[str, Any]) -> dict[str, str]:
    """Return a static 1-extractor/2-reviewer role split within each lane."""
    lanes = spec["execution"]["worker_lanes"]
    roles: dict[str, str] = {}
    for lane in sorted({lane for allowed in lanes.values() for lane in allowed}):
        members = sorted(worker for worker, allowed in lanes.items() if lane in allowed)
        if len(members) < 2:
            raise ValueError(f"lane {lane!r} needs at least two workers for a tuned static split")
        roles[members[0]] = "extract"
        roles.update({worker: "review" for worker in members[1:]})
    return roles


def _delay_spec(spec: dict[str, Any], no_delay: bool) -> dict[str, Any]:
    clone = copy.deepcopy(spec)
    for job in clone["jobs"]:
        if no_delay:
            job["emulator_seconds"] = 0
            job["review_seconds"] = 0
    return clone


def collect_run_metrics(run_dir: pathlib.Path, run_result: Any, wall_seconds: float) -> dict[str, Any]:
    """Measure one checksum-verified completion snapshot.

    ``state.json`` and ``events.jsonl`` are mutable compatibility aliases. A
    workspace sync can roll them back after a successful run, so metrics use
    the dispatcher's immutable completion record and its coherent event list.
    Alias differences are surfaced as evidence rather than used as outcomes.
    """
    from . import dispatcher

    state = dispatcher.read_committed_state(run_dir)
    try:
        mutable_state = read_json(run_dir / "state.json")
        state_matches = mutable_state == state
    except (OSError, json.JSONDecodeError):
        state_matches = False
    try:
        events_path = run_dir / "events.jsonl"
        alias_events = [
            json.loads(line)
            for line in events_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        events_match = alias_events == state.get("events")
    except (OSError, json.JSONDecodeError):
        events_match = False
    aliases_match = state_matches and events_match
    jobs = state.get("jobs", {})
    accepted_receipts: list[dict[str, Any]] = []
    accepted_attempts: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for job in jobs.values():
        for attempt in job.get("attempts", []):
            if not attempt.get("accepted"):
                continue
            receipt = job.get("receipt_data")
            if not isinstance(receipt, dict) or receipt.get("attempt_id") != attempt.get("attempt_id"):
                raise ValueError(f"committed accepted receipt missing for {job.get('id')} attempt {attempt.get('attempt_id')}")
            accepted_receipts.append(receipt)
            accepted_attempts.append((job, receipt))
    coordinator_events = state.get("events")
    if not isinstance(coordinator_events, list):
        raise ValueError("committed completion state has no coherent event list")
    native_events = [event for event in coordinator_events if event.get("type") == "native_solve"]
    root_jobs = {jid: job for jid, job in jobs.items() if job.get("kind") == "extract" and not job.get("repair_of")}
    final_reviews = state.get("final_reviews", {})
    final_review_receipts = []
    for root_id, review_id in final_reviews.items():
        review_job = jobs.get(review_id, {})
        receipt_data = review_job.get("receipt_data")
        if isinstance(receipt_data, dict):
            final_review_receipts.append(receipt_data)
    all_done = bool(root_jobs) and all(job.get("status") == "done" for job in root_jobs.values())
    all_final_accepted = bool(root_jobs) and all(
        job.get("final_status") == "accepted"
        and root_id in final_reviews
        and jobs.get(final_reviews[root_id], {}).get("status") == "done"
        for root_id, job in root_jobs.items()
    )
    accepted_reviews = sum(row.get("decision") == "accepted" for _, row in accepted_attempts if row.get("kind") == "review")
    amend_reviews = sum(row.get("decision") == "amend" for _, row in accepted_attempts if row.get("kind") == "review")
    solve_seconds = [float(event["native_seconds"]) for event in native_events if isinstance(event.get("native_seconds"), (int, float))]
    work_seconds = [float(row["work_seconds"]) for row in accepted_receipts if isinstance(row.get("work_seconds"), (int, float))]
    simulated = [float(row["simulated_service_seconds"]) for row in accepted_receipts if isinstance(row.get("simulated_service_seconds"), (int, float))]
    extracts = [row for row in accepted_receipts if row.get("kind") == "extract"]
    reviews = [row for row in accepted_receipts if row.get("kind") == "review"]
    # Batch-complete is the canonical total; per-worker rows project the same
    # durations and must not be summed into that total a second time.
    dispatch_seconds = [float(event["dispatch_seconds"]) for event in coordinator_events if event.get("type") == "dispatch_batch_complete" and isinstance(event.get("dispatch_seconds"), (int, float))]
    dispatch_attempts = [event for event in coordinator_events if event.get("type") == "dispatch_requested"]
    submitted_by_attempt = {event.get("attempt_id"): event for event in coordinator_events if event.get("type") == "worker_submitted"}
    arrival_by_attempt = {event.get("attempt_id"): event for event in coordinator_events if event.get("type") == "receipt_arrived"}
    worker_stats: dict[str, dict[str, Any]] = {}
    for event in dispatch_attempts:
        worker = event.get("worker")
        if isinstance(worker, str):
            worker_stats.setdefault(worker, {"packet_count": 0, "accepted_receipts": 0, "dispatch_seconds": 0.0, "work_seconds": 0.0, "worker_elapsed_seconds": 0.0, "turnaround_seconds": 0.0, "roles": []})["packet_count"] += 1
    for attempt_id, event in submitted_by_attempt.items():
        worker = event.get("worker")
        if isinstance(worker, str):
            worker_stats.setdefault(worker, {"packet_count": 0, "accepted_receipts": 0, "dispatch_seconds": 0.0, "work_seconds": 0.0, "worker_elapsed_seconds": 0.0, "turnaround_seconds": 0.0, "roles": []})["dispatch_seconds"] += float(event.get("dispatch_seconds", 0.0))
    for _, receipt in accepted_attempts:
        worker = receipt.get("worker")
        if not isinstance(worker, str):
            continue
        row = worker_stats.setdefault(worker, {"packet_count": 0, "accepted_receipts": 0, "dispatch_seconds": 0.0, "work_seconds": 0.0, "worker_elapsed_seconds": 0.0, "turnaround_seconds": 0.0, "roles": []})
        row["accepted_receipts"] += 1
        row["work_seconds"] += float(receipt.get("work_seconds", 0.0))
        row["worker_elapsed_seconds"] += float(receipt.get("elapsed_seconds", 0.0))
        attempt_id = receipt.get("attempt_id")
        dispatch_event = next((event for event in dispatch_attempts if event.get("attempt_id") == attempt_id), None)
        arrival_event = arrival_by_attempt.get(attempt_id)
        if dispatch_event and arrival_event and isinstance(dispatch_event.get("monotonic"), (int, float)) and isinstance(arrival_event.get("receipt_arrived_monotonic"), (int, float)):
            row["turnaround_seconds"] += max(0.0, float(arrival_event["receipt_arrived_monotonic"]) - float(dispatch_event["monotonic"]))
        row["roles"].append((str(receipt.get("ended_at", "")), receipt.get("kind")))
    for row in worker_stats.values():
        roles = [role for _, role in sorted(row["roles"]) if role in {"extract", "review"}]
        row["role_transitions"] = sum(left != right for left, right in zip(roles, roles[1:]))
        del row["roles"]
    return {
        "wall_seconds": wall_seconds,
        "solver_seconds": sum(solve_seconds),
        "dispatch_seconds": sum(dispatch_seconds),
        "worker_work_seconds": sum(work_seconds),
        "simulated_service_seconds": sum(simulated),
        "extract_receipts": len(extracts),
        "review_receipts": len(reviews),
        "all_review_attempts": len(reviews),
        "accepted_reviews": accepted_reviews,
        "amend_reviews": amend_reviews,
        "all_final_jobs_done": all_done,
        "final_review_receipts": len(final_review_receipts),
        "all_final_reviews_accepted": all_final_accepted,
        "repair_count": sum(job.get("repair_count", 0) for job in root_jobs.values()),
        "coordinator_status": run_result.get("status") if isinstance(run_result, dict) else None,
        "mutable_snapshot_matches_committed": aliases_match,
        "mutable_state_matches_committed": state_matches,
        "mutable_events_match_committed": events_match,
        "worker_stats": worker_stats,
    }


def aggregate(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"median": None, "min": None, "max": None, "range": None}
    return {
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
        "range": max(values) - min(values),
    }


def comparison_ratio(dynamic: list[float], fixed: list[float]) -> dict[str, float | None]:
    d = statistics.median(dynamic) if dynamic else None
    f = statistics.median(fixed) if fixed else None
    return {
        "dynamic_over_fixed": d / f if d is not None and f else None,
        "signed_improvement_fraction": (f - d) / f if d is not None and f else None,
    }


def _resolve_source_paths(spec: dict[str, Any], spec_path: pathlib.Path) -> dict[str, Any]:
    clone = copy.deepcopy(spec)
    raw_root = clone.get("source_root", ".")
    if not isinstance(raw_root, str):
        raise ValueError("source_root must be a path string")
    source_root = (spec_path.resolve().parent / raw_root).resolve()
    for job in clone["jobs"]:
        candidate = pathlib.Path(job["source_path"])
        if not candidate.is_absolute():
            job["source_path"] = str((source_root / candidate).resolve())
    return clone


def _run_single(spec: dict[str, Any], policy: str, run_dir: pathlib.Path, max_seconds: float) -> dict[str, Any]:
    from experiments.rebalancer import dispatcher

    run_dir.mkdir(parents=True, exist_ok=False)
    run_spec = copy.deepcopy(spec)
    actual_policy = "fixed" if policy == "fixed_tuned" else policy
    if policy == "fixed_tuned":
        run_spec["execution"]["fixed_roles"] = tuned_roles(run_spec)
    spec_path = run_dir / "spec.json"
    write_json(spec_path, run_spec)
    started = time.perf_counter()
    dispatcher.initialize(spec_path, run_dir, policy=actual_policy)
    session_results: list[dict[str, Any]] = []
    result: dict[str, Any] | None = None
    for session_number in range(1, MAX_NATIVE_SCORE_SESSIONS + 1):
        session_started_at = dt.datetime.now(dt.timezone.utc).isoformat()
        session_started = time.perf_counter()
        try:
            result = dispatcher.run(run_dir, max_seconds=max_seconds)
        except RuntimeError as exc:
            session_elapsed = time.perf_counter() - session_started
            session_finished_at = dt.datetime.now(dt.timezone.utc).isoformat()
            reasons = _native_score_rejection(exc)
            if reasons is None:
                raise
            failure = {
                "schema": "chainspot.rebalancer-session-failure/v1",
                "policy": policy,
                "dispatcher_policy": actual_policy,
                "session_number": session_number,
                "started_at": session_started_at,
                "finished_at": session_finished_at,
                "elapsed_seconds": session_elapsed,
                "exception_type": type(exc).__name__,
                "exception": str(exc),
                "reason": reasons,
            }
            failure_path = run_dir / "session-failures" / f"session-{session_number:02}.json"
            write_json_once(failure_path, failure)
            session_results.append({**failure, "failure_record": str(failure_path.resolve())})
            if session_number == MAX_NATIVE_SCORE_SESSIONS:
                wall = time.perf_counter() - started
                exhausted = {
                    "schema": "chainspot.rebalancer-run/v1",
                    "status": "native_score_retry_exhausted",
                    "policy": policy,
                    "dispatcher_policy": actual_policy,
                    "wall_seconds": wall,
                    "native_score_failure_count": len(session_results),
                    "failed_session_seconds": sum(row["elapsed_seconds"] for row in session_results),
                    "session_results": session_results,
                }
                write_json(run_dir / "benchmark-run.json", exhausted)
                raise RuntimeError(
                    f"native nonoptimal score rejection retry cap exhausted after {MAX_NATIVE_SCORE_SESSIONS} sessions: {run_dir}"
                ) from exc
            continue
        else:
            session_results.append({
                "session_number": session_number,
                "started_at": session_started_at,
                "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "elapsed_seconds": time.perf_counter() - session_started,
                "status": result.get("status") if isinstance(result, dict) else None,
                "run_result": result,
            })
            break
    if result is None:
        raise RuntimeError(f"dispatcher returned no run result: {run_dir}")
    wall = time.perf_counter() - started
    metrics = collect_run_metrics(run_dir, result, wall)
    failure_count = sum(row.get("reason") == ["nonoptimal_native_score"] for row in session_results)
    raw = {
        "policy": policy,
        "dispatcher_policy": actual_policy,
        "run_result": result,
        "metrics": metrics,
        "wall_seconds": wall,
        "native_score_failure_count": failure_count,
        "failed_session_seconds": sum(row["elapsed_seconds"] for row in session_results if "reason" in row),
        "session_results": session_results,
    }
    write_json(run_dir / "benchmark-run.json", raw)
    if not metrics["all_final_jobs_done"] or not metrics["all_final_reviews_accepted"]:
        raise RuntimeError(f"run did not reach accepted completion: {run_dir} ({metrics})")
    return raw


def _report_markdown(result: dict[str, Any]) -> str:
    lines = [
        "# Native Rebalancer execution comparison",
        "",
        "This is a deterministic local worker-emulator experiment. Workers parse actual, hash-pinned Python source and independently reread it during review. There is no live LLM dispatch and no claim of LLM speedup.",
        "",
        "The workload repeats eight read-only extraction tasks over one hash-pinned adversarial Python module. This is a low-diversity scheduling workload and does not establish broad extraction quality.",
        "",
        f"Runs per policy/scenario: {result['repetitions']}. Paired dynamic/fixed order alternated AB/BA. No-delay control: {result['no_delay_control']}.",
        "",
        f"Each coordinator session is bounded to {result['max_seconds_per_session']} seconds, with up to {result['max_sessions_per_run']} sessions per run. Only the exact native `nonoptimal_native_score` rejection is retried; each failed session is preserved with its duration.",
        "",
        "## Medians and observed ranges",
        "",
        "| Scenario | Policy | Wall median (s) | Wall range (s) | Verified solver median (s) | Dispatch median (s) | Accepted worker work median (s) | Accepted simulated service (s) | Native score failures | Mutable alias mismatches |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for scenario, policies in result["summary"].items():
        for policy in POLICIES:
            row = policies[policy]
            m = row["metrics"]
            wall = m["wall_seconds"]
            solver = m["solver_seconds"]
            dispatch = m["dispatch_seconds"]
            work = m["worker_work_seconds"]
            sim = m["simulated_service_seconds"]
            alias_mismatches = policies[policy].get("mutable_snapshot_mismatch_runs", 0)
            score_failures = policies[policy].get("native_score_failure_count", 0)
            lines.append(f"| {scenario} | {policy} | {wall['median']:.4f} | {wall['min']:.4f}–{wall['max']:.4f} | {solver['median']:.4f} | {dispatch['median']:.4f} | {work['median']:.4f} | {sim['median']:.4f} | {score_failures} | {alias_mismatches} |")
    lines.extend(["", "## Dynamic versus balanced fixed roles", ""])
    for scenario in ("delayed", "no_delay"):
        ratio = result["summary"][scenario]["dynamic_vs_fixed_wall"]
        r = ratio["dynamic_over_fixed"]
        improvement = ratio["signed_improvement_fraction"]
        lines.append(f"{scenario}: dynamic/fixed median wall-time ratio = {r:.4f}; signed improvement = {improvement:+.1%} (positive means dynamic was faster).")
    lines.extend([
        "",
        "Wall time includes initialization, failed native-score sessions, their worker drain/recovery, and completion commit. Verified solver time sums only successful `native_solve` events; each rejected session is preserved with its duration in the raw run directory. Worker work and simulated service totals include accepted receipts only, so partial work from abandoned sessions is excluded.",
        "",
        "Balanced fixed roles use W1/W2/W4 as extractors and W3/W5/W6 as reviewers (3/3). The tuned static control uses one extractor and two reviewers within each lane (2/4). Results report observed timing; the dynamic policy is allowed to be slower.",
        "",
        "Each raw run directory includes its generated spec, coordinator state/logs, receipts, and `benchmark-run.json`. `comparison.json` contains paired raw metrics and these aggregates.",
        "",
    ])
    return "\n".join(lines)


def run_benchmark(recipe_path: pathlib.Path, output_dir: pathlib.Path, *, repetitions: int = 5, max_seconds: float = 30) -> dict[str, Any]:
    if repetitions < 1:
        raise ValueError("repetitions must be at least 1")
    recipe = _resolve_source_paths(read_json(recipe_path), recipe_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    policy_raw: dict[str, dict[str, list[dict[str, Any]]]] = {scenario: {p: [] for p in POLICIES} for scenario in ("delayed", "no_delay")}
    order_log: dict[str, list[list[str]]] = {scenario: [] for scenario in policy_raw}
    for scenario in ("delayed", "no_delay"):
        scenario_spec = _delay_spec(recipe, no_delay=scenario == "no_delay")
        for pair in range(repetitions):
            paired = ["dynamic", "fixed"] if pair % 2 == 0 else ["fixed", "dynamic"]
            order = paired.copy()
            order.insert(pair % 3, "fixed_tuned")
            order_log[scenario].append(order.copy())
            for policy in order:
                run_dir = output_dir / scenario / f"rep-{pair + 1:02}-{policy}"
                policy_raw[scenario][policy].append(_run_single(scenario_spec, policy, run_dir, max_seconds))

    summary: dict[str, Any] = {}
    for scenario, policies in policy_raw.items():
        summary[scenario] = {}
        for policy, runs in policies.items():
            summary[scenario][policy] = {
                "metrics": {
                    name: aggregate([run["metrics"][name] for run in runs])
                    for name in ("wall_seconds", "solver_seconds", "dispatch_seconds", "worker_work_seconds", "simulated_service_seconds")
                },
                "mutable_snapshot_mismatch_runs": sum(
                    not run["metrics"].get("mutable_snapshot_matches_committed", True)
                    for run in runs
                ),
                "native_score_failure_count": sum(run.get("native_score_failure_count", 0) for run in runs),
                "runs": [run["metrics"] for run in runs],
            }
        summary[scenario]["dynamic_vs_fixed_wall"] = comparison_ratio(
            [run["metrics"]["wall_seconds"] for run in policies["dynamic"]],
            [run["metrics"]["wall_seconds"] for run in policies["fixed"]],
        )
        summary[scenario]["dynamic_vs_tuned_fixed_wall"] = comparison_ratio(
            [run["metrics"]["wall_seconds"] for run in policies["dynamic"]],
            [run["metrics"]["wall_seconds"] for run in policies["fixed_tuned"]],
        )
    result = {
        "schema": "chainspot.rebalancer-benchmark/v1",
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "recipe": str(recipe_path.resolve()),
        "repetitions": repetitions,
        "no_delay_control": True,
        "max_seconds_per_session": max_seconds,
        "max_sessions_per_run": MAX_NATIVE_SCORE_SESSIONS,
        "pair_order": order_log,
        "summary": summary,
        "raw_runs": policy_raw,
        "limitations": [
            "Explicit local deterministic worker emulator; no live LLM dispatch.",
            "Eight repeated reads of one Python module form a low-diversity workload.",
            "AST extraction and review share one parser implementation; review is an independent worker reread, not an independent algorithm.",
            "Runs share a container with no exclusive CPU guarantee; wall-time results are observational.",
            f"Only the exact native nonoptimal-score rejection is retried, up to {MAX_NATIVE_SCORE_SESSIONS} coordinator sessions per benchmark run; wall time includes these failed sessions.",
            "Verified solver time includes successful native_solve events only. Worker work and simulated service totals include accepted receipts only, excluding partial work from failed or abandoned sessions.",
        ],
    }
    write_json(output_dir / "comparison.json", result)
    (output_dir / "report.md").write_text(_report_markdown(result), encoding="utf-8")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recipe", type=pathlib.Path, default=pathlib.Path(__file__).parent / "recipes" / "execution.example.json")
    parser.add_argument("--output", type=pathlib.Path, required=True, help="directory for preserved raw runs and comparison reports")
    parser.add_argument("--repetitions", type=int, default=5)
    parser.add_argument("--max-seconds", type=float, default=30)
    args = parser.parse_args(argv)
    if not args.recipe.is_file():
        parser.error(f"recipe does not exist: {args.recipe}")
    if args.max_seconds <= 0 or not math.isfinite(args.max_seconds):
        parser.error("--max-seconds must be a finite positive number")
    try:
        result = run_benchmark(args.recipe, args.output, repetitions=args.repetitions, max_seconds=args.max_seconds)
    except Exception as exc:
        print(f"benchmark failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps({"output": str(args.output.resolve()), "repetitions": result["repetitions"], "summary": result["summary"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
