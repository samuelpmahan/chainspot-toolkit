#!/usr/bin/env python3
"""Receipt-gated local dispatcher emulator backed by the native probe solver.

This is a bounded experiment: workers are local functions in this coordinator
process. It does not call an agent API or make claims about live-agent behavior.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import contextlib
import copy
import datetime as dt
import fcntl
import hashlib
import json
import math
import os
import pathlib
import sys
import threading
import time
import uuid
from typing import Any, Iterator

from . import probe

try:
    from .worker import execute, validate_review_evidence
except ImportError:  # worker is supplied by the separate bounded workload change
    validate_review_evidence = None

    def execute(packet: dict[str, Any]) -> dict[str, Any]:  # pragma: no cover - fallback
        raise RuntimeError("local worker is unavailable; install experiments.rebalancer.worker")


STATE_NAME = "state.json"
STATE_SCHEMA = "chainspot.dispatcher-state/v1"
COMPLETION_NAME = "completion.json"
COMPLETION_SCHEMA = "chainspot.dispatcher-completion/v1"
IGNORED_JOB_FIELDS = {
    "status", "worker", "started_at", "finished_at", "receipt", "receipt_data",
    "attempt_number", "attempts", "active_attempt", "blocked_reason", "final_status", "_dependency_receipt",
    "repair_count",
}


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def receipt_digest(receipt: dict[str, Any]) -> str:
    """Hash a complete receipt in a stable representation."""
    return _sha256_bytes(_canonical(receipt))


def _file_sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path: pathlib.Path, data: Any) -> None:
    """Atomically replace one JSON snapshot and durably flush it."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{os.getpid()}.{threading.get_ident()}.{time.time_ns()}.tmp")
    with temp.open("w", encoding="utf-8") as stream:
        json.dump(data, stream, indent=2, ensure_ascii=False)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)
    try:
        fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    except OSError:  # some filesystems do not support directory fsync
        pass


def _write_events(run_dir: pathlib.Path, events: list[dict[str, Any]]) -> None:
    path = run_dir / "events.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    with temp.open("w", encoding="utf-8") as stream:
        for event in events:
            stream.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


def _persist(run_dir: pathlib.Path, state: dict[str, Any]) -> None:
    write_json(run_dir / STATE_NAME, state)
    _write_events(run_dir, state["events"])


def _event(state: dict[str, Any], run_dir: pathlib.Path, kind: str, **fields: Any) -> dict[str, Any]:
    event = _append_event(state, kind, **fields)
    _persist(run_dir, state)
    return event


def _append_event(state: dict[str, Any], kind: str, **fields: Any) -> dict[str, Any]:
    event = {
        "type": kind,
        "at": now(),
        "monotonic": time.monotonic(),
        "session_id": state.get("session_id"),
        "process_id": os.getpid(),
        **fields,
    }
    state["events"].append(event)
    state["revision"] += 1
    return event


def _resolve_source(raw: str, source_root: pathlib.Path) -> pathlib.Path:
    candidate = pathlib.Path(raw).expanduser()
    if candidate.is_absolute():
        resolved = candidate.resolve()
        if resolved.is_file():
            return resolved
        raise FileNotFoundError(f"source file does not exist: {resolved}")
    resolved = (source_root / candidate).resolve()
    if resolved.is_file():
        return resolved
    raise FileNotFoundError(f"source file {raw!r} does not exist under configured source root {source_root}")


def _clean_job(job: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in job.items() if key not in IGNORED_JOB_FIELDS}


def input_digest(job: dict[str, Any], extraction_receipt: dict[str, Any] | None) -> str:
    """Hash immutable packet inputs, including the exact receipt under review."""
    body = {"job": _clean_job(job)}
    if extraction_receipt is not None:
        body["extraction_receipt_sha256"] = receipt_digest(extraction_receipt)
    return _sha256_bytes(_canonical(body))


def _validate_source(job: dict[str, Any]) -> None:
    path = pathlib.Path(job["source_path"])
    if not path.is_absolute():
        raise ValueError(f"source_path must be absolute after initialization: {path}")
    if not path.is_file():
        raise FileNotFoundError(f"source file disappeared: {path}")
    observed = _file_sha256(path)
    if observed != job.get("source_sha256"):
        raise ValueError(f"source_sha256 mismatch for {job['id']}: expected {job.get('source_sha256')}, observed {observed}")


def _review_id(job_id: str, prefix: str) -> str:
    return probe.review_id(job_id, prefix)


def _make_review(job: dict[str, Any], prefix: str) -> dict[str, Any]:
    review_id = _review_id(job["id"], prefix)
    return {
        "id": review_id,
        "kind": "review",
        "depends_on": job["id"],
        "root_job_id": job.get("root_job_id", job["id"]),
        "lane": job.get("lane", "default"),
        "review_allow_workers": job.get("review_allow_workers"),
        "expected_declarations": job.get("expected_declarations"),
        "source_path": job.get("source_path"),
        "source_sha256": job.get("source_sha256"),
        "review_seconds": job.get("review_seconds", 0),
        "emulator_seconds": job.get("emulator_seconds", 0),
        "allow_workers": job.get("review_allow_workers"),
        "status": "pending",
        "worker": None,
        "started_at": None,
        "finished_at": None,
        "attempt_number": 0,
        "attempts_used": 0,
        "attempts": [],
        "active_attempt": None,
    }


def initialize(spec_path: pathlib.Path, run_dir: pathlib.Path, policy: str = "dynamic") -> None:
    """Create an immutable-input run directory and durable initial snapshot."""
    spec_path = pathlib.Path(spec_path).expanduser().resolve()
    run_dir = pathlib.Path(run_dir).expanduser().resolve()
    if policy not in {"dynamic", "fixed"}:
        raise ValueError("policy must be dynamic or fixed")
    if (run_dir / STATE_NAME).exists() or (run_dir / COMPLETION_NAME).exists():
        raise FileExistsError(f"dispatcher run already exists: {run_dir}")
    spec_bytes = spec_path.read_bytes()
    spec = json.loads(spec_bytes)
    base = probe.make_state(spec)
    source_root_value = spec.get("source_root", ".")
    if not isinstance(source_root_value, str) or not source_root_value.strip():
        raise ValueError("source_root must be a non-empty path string")
    source_root = pathlib.Path(source_root_value).expanduser()
    if not source_root.is_absolute():
        source_root = spec_path.parent / source_root
    source_root = source_root.resolve()
    execution = spec.get("execution", {})
    if not isinstance(execution, dict):
        raise ValueError("execution must be an object")
    max_attempts = execution.get("max_attempts", 3)
    max_repairs = execution.get("max_repairs", 1)
    for name, value in (("max_attempts", max_attempts), ("max_repairs", max_repairs)):
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise ValueError(f"execution.{name} must be a non-negative integer")
    if max_attempts < 1:
        raise ValueError("execution.max_attempts must be at least 1")
    workers = list(base["workers"])
    worker_lanes = execution.get("worker_lanes", {})
    fixed_roles = execution.get("fixed_roles", {})
    if not isinstance(worker_lanes, dict) or not isinstance(fixed_roles, dict):
        raise ValueError("execution.worker_lanes and execution.fixed_roles must be objects")
    for worker, lanes in worker_lanes.items():
        if worker not in workers or not isinstance(lanes, list) or any(not isinstance(item, str) for item in lanes):
            raise ValueError(f"invalid worker_lanes entry for {worker!r}")
    for worker, roles in fixed_roles.items():
        if worker not in workers or not (isinstance(roles, str) or isinstance(roles, list) and all(isinstance(item, str) for item in roles)):
            raise ValueError(f"invalid fixed_roles entry for {worker!r}")
    if policy == "fixed" and not fixed_roles:
        raise ValueError("fixed policy requires execution.fixed_roles")

    prefix = spec.get("review_policy", {}).get("review_prefix", "R")
    jobs: dict[str, dict[str, Any]] = {}
    for raw in spec["jobs"]:
        job = dict(raw)
        source_path_raw = job.get("source_path")
        source_digest = job.get("source_sha256")
        if not isinstance(source_path_raw, str) or not isinstance(source_digest, str) or len(source_digest) != 64:
            raise ValueError(f"{job['id']} requires source_path and source_sha256")
        job["source_path"] = str(_resolve_source(source_path_raw, source_root))
        job["source_sha256"] = source_digest.lower()
        job.setdefault("lane", "default")
        job["root_job_id"] = job["id"]
        job["repair_count"] = 0
        job["attempt_number"] = 0
        job["attempts_used"] = 0
        job["attempts"] = []
        job["active_attempt"] = None
        job["status"] = "pending"
        job["worker"] = None
        job["started_at"] = None
        job["finished_at"] = None
        job["max_attempts"] = max_attempts
        _validate_source(job)
        if job.get("allow_workers") is not None and (not isinstance(job["allow_workers"], list) or any(w not in workers for w in job["allow_workers"])):
            raise ValueError(f"{job['id']}.allow_workers must contain declared worker ids")
        if job.get("review_allow_workers") is not None and (not isinstance(job["review_allow_workers"], list) or any(w not in workers for w in job["review_allow_workers"])):
            raise ValueError(f"{job['id']}.review_allow_workers must contain declared worker ids")
        jobs[job["id"]] = job
        if spec.get("review_policy", {}).get("enabled", True):
            review = _make_review(job, prefix)
            if review["id"] in jobs:
                raise ValueError(f"review id collides with a job: {review['id']}")
            jobs[review["id"]] = review

    for jid, job in jobs.items():
        if job["kind"] != "extract" or not job.get("depends_on"):
            continue
        dependency = jobs.get(job["depends_on"])
        if dependency is None or dependency.get("kind") not in {"extract", "review"}:
            raise ValueError(f"{jid}.depends_on must identify a declared extraction or generated review job")
        if dependency.get("root_job_id", dependency["id"]) == jid:
            raise ValueError(f"{jid}.depends_on cannot refer to itself")

    if policy == "fixed":
        for worker in workers:
            if worker not in fixed_roles:
                raise ValueError(f"fixed policy requires a role for worker {worker}")
    state = {
        "schema": STATE_SCHEMA,
        "policy": policy,
        "service": base.get("service", {}),
        "spec_path": str(spec_path),
        "spec_sha256": _sha256_bytes(spec_bytes),
        "review_prefix": prefix,
        "review_enabled": spec.get("review_policy", {}).get("enabled", True),
        "review_policy": spec.get("review_policy", {}),
        "execution": {**execution, "max_attempts": max_attempts, "max_repairs": max_repairs},
        "native_policy": base.get("policy", {"extract_priority": 100, "review_priority": 200, "repair_priority": 300}),
        "workers": {worker: {"job": None, "attempt_id": None, "role": None, "last_role": None} for worker in workers},
        "jobs": jobs,
        "events": [],
        "revision": 0,
        "decision_number": 0,
        "solve_count": 0,
        "final_reviews": {},
        "session_id": None,
        "created_at": now(),
    }
    run_dir.mkdir(parents=True, exist_ok=True)
    _persist(run_dir, state)


def _load_state(run_dir: pathlib.Path) -> dict[str, Any]:
    run_dir = pathlib.Path(run_dir).expanduser().resolve()
    completion_path = run_dir / COMPLETION_NAME
    if completion_path.exists():
        return _read_completion(run_dir)["state"]
    state = _read_mutable_state(run_dir)
    _write_events(run_dir, state.get("events", []))
    return state


def _read_mutable_state(run_dir: pathlib.Path) -> dict[str, Any]:
    state = json.loads((run_dir / STATE_NAME).read_text(encoding="utf-8"))
    if state.get("schema") != STATE_SCHEMA:
        raise ValueError("unsupported dispatcher state schema")
    spec_path = pathlib.Path(state["spec_path"])
    spec_digest = _sha256_bytes(spec_path.read_bytes())
    if spec_digest != state.get("spec_sha256"):
        raise ValueError("the source recipe changed after initialization; refusing to resume")
    return state


def _event_projection_bytes(events: list[dict[str, Any]]) -> bytes:
    return "".join(
        json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n"
        for event in events
    ).encode("utf-8")


def _accepted_receipt_bindings(run_dir: pathlib.Path, state: dict[str, Any]) -> list[dict[str, Any]]:
    """Read and verify each accepted receipt through its job/attempt-bound path."""
    rows: list[dict[str, Any]] = []
    seen_attempts: set[str] = set()
    for job_id, job in sorted(state.get("jobs", {}).items()):
        accepted_attempts = [attempt for attempt in job.get("attempts", []) if attempt.get("accepted") is True]
        if len(accepted_attempts) > 1:
            raise ValueError(f"completion has multiple accepted attempts for job {job_id}")
        if job.get("status") == "done" and len(accepted_attempts) != 1:
            raise ValueError(f"completed job {job_id} must have exactly one accepted receipt")
        if accepted_attempts and job.get("status") != "done":
            raise ValueError(f"accepted receipt belongs to non-complete job {job_id}")
        for attempt in accepted_attempts:
            attempt_id = attempt.get("attempt_id")
            worker = attempt.get("worker")
            if not isinstance(attempt_id, str) or not attempt_id or pathlib.PurePath(attempt_id).name != attempt_id:
                raise ValueError(f"accepted attempt for {job_id} has an unsafe attempt id")
            if attempt_id in seen_attempts:
                raise ValueError(f"completion repeats accepted attempt id {attempt_id}")
            seen_attempts.add(attempt_id)
            if not isinstance(worker, str) or not worker:
                raise ValueError(f"accepted attempt {attempt_id} has no worker")

            expected_receipt_path = _attempt_receipt_path(run_dir, job_id, attempt_id).resolve()
            relative_receipt_path = expected_receipt_path.relative_to(run_dir.resolve()).as_posix()
            stored_path = attempt.get("receipt_path")
            if stored_path is not None and pathlib.Path(stored_path).expanduser().resolve() != expected_receipt_path:
                raise ValueError(f"accepted receipt path for {attempt_id} is outside its job/attempt directory")
            job_receipt_path = job.get("receipt")
            if job_receipt_path is not None and pathlib.Path(job_receipt_path).expanduser().resolve() != expected_receipt_path:
                raise ValueError(f"job receipt path for {job_id} does not match its accepted attempt")
            try:
                receipt = json.loads(expected_receipt_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise ValueError(f"accepted receipt file is unavailable for {attempt_id}: {exc}") from exc
            digest = receipt_digest(receipt) if isinstance(receipt, dict) else None
            if not isinstance(digest, str) or digest != attempt.get("receipt_sha256"):
                raise ValueError(f"accepted receipt hash mismatch for {attempt_id}")
            if digest != job.get("receipt_sha256") or receipt != job.get("receipt_data"):
                raise ValueError(f"accepted receipt conflicts with completed job {job_id}")

            packet_path = run_dir / "attempts" / job_id / attempt_id / "packet.json"
            try:
                packet = json.loads(packet_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise ValueError(f"accepted packet file is unavailable for {attempt_id}: {exc}") from exc
            if not isinstance(packet, dict) or packet.get("job_id") != job_id or packet.get("attempt_id") != attempt_id:
                raise ValueError(f"accepted packet identity mismatch for {attempt_id}")
            if packet.get("worker") != worker or packet.get("input_digest") != attempt.get("input_digest"):
                raise ValueError(f"accepted packet binding mismatch for {attempt_id}")
            packet_job = packet.get("job")
            if not isinstance(packet_job, dict):
                raise ValueError(f"accepted packet job differs from completed job {job_id}")
            packet_job_identity = dict(packet_job)
            current_job_identity = _packet_job_for(job)
            packet_parent_receipt_sha256 = packet_job_identity.pop("receipt_sha256", None)
            current_job_identity.pop("receipt_sha256", None)
            if packet_job_identity != current_job_identity:
                raise ValueError(f"accepted packet job differs from completed job {job_id}")
            if job.get("repair_of"):
                parent = state.get("jobs", {}).get(job["repair_of"])
                if parent is None or packet_parent_receipt_sha256 != parent.get("receipt_sha256"):
                    raise ValueError(f"repair packet for {attempt_id} is not bound to its original extraction")
            elif packet_parent_receipt_sha256 is not None:
                raise ValueError(f"unexpected prior receipt binding in packet for {attempt_id}")
            extraction_receipt = None
            if job.get("kind") == "review":
                dependency = state.get("jobs", {}).get(job.get("depends_on"))
                extraction_receipt = packet.get("extraction_receipt")
                if dependency is None or extraction_receipt != dependency.get("receipt_data"):
                    raise ValueError(f"accepted review packet for {attempt_id} is not bound to its extraction")
            if input_digest(packet["job"], extraction_receipt) != attempt.get("input_digest"):
                raise ValueError(f"accepted packet input digest mismatch for {attempt_id}")
            if packet.get("decision_id") != attempt.get("decision_id"):
                raise ValueError(f"accepted packet decision mismatch for {attempt_id}")

            receipt_attempt = {
                "attempt_id": attempt_id,
                "worker": worker,
                "input_digest": attempt.get("input_digest"),
                "packet": packet,
            }
            _validate_receipt(receipt, job, receipt_attempt)
            rows.append({
                "job_id": job_id,
                "attempt_id": attempt_id,
                "worker": worker,
                "kind": job.get("kind"),
                "path": relative_receipt_path,
                "sha256": digest,
                "receipt": receipt,
            })
    return rows


def _validate_complete_state(state: dict[str, Any]) -> None:
    if not isinstance(state, dict) or state.get("schema") != STATE_SCHEMA:
        raise ValueError("completion state has an unsupported schema")
    if _result_status(state) != "complete":
        raise ValueError("completion state does not have accepted final status for every root job")
    roots = [
        job for job in state.get("jobs", {}).values()
        if job.get("kind") == "extract" and not job.get("repair_of")
    ]
    if not roots:
        raise ValueError("completion state has no root extraction jobs")
    if any(job.get("status") != "done" or job.get("active_attempt") for job in state["jobs"].values()):
        raise ValueError("completion state contains unfinished or active jobs")
    final_reviews = state.get("final_reviews")
    if not isinstance(final_reviews, dict):
        raise ValueError("completion state has no final review map")
    for root in roots:
        root_id = root["id"]
        if root.get("status") != "done" or root.get("final_status") != "accepted":
            raise ValueError(f"root job {root_id} is not finally accepted")
        if state.get("review_enabled"):
            review_id = final_reviews.get(root_id)
            review = state["jobs"].get(review_id) if isinstance(review_id, str) else None
            if (
                not isinstance(review, dict)
                or review.get("kind") != "review"
                or review.get("root_job_id") != root_id
                or review.get("status") != "done"
                or not isinstance(review.get("receipt_data"), dict)
                or review["receipt_data"].get("decision") != "accepted"
            ):
                raise ValueError(f"root job {root_id} has no accepted final review")
        elif root_id not in final_reviews or final_reviews[root_id] is not None:
            raise ValueError(f"review-disabled root job {root_id} has an invalid final review entry")


def _read_completion(run_dir: pathlib.Path) -> dict[str, Any]:
    run_dir = pathlib.Path(run_dir).expanduser().resolve()
    path = run_dir / COMPLETION_NAME
    try:
        completion = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"completion receipt is unavailable or invalid: {exc}") from exc
    if not isinstance(completion, dict) or completion.get("schema") != COMPLETION_SCHEMA:
        raise ValueError("unsupported dispatcher completion receipt schema")
    if completion.get("run_dir") != str(run_dir):
        raise ValueError("completion receipt belongs to a different run directory")
    state = completion.get("state")
    if not isinstance(state, dict) or state.get("schema") != STATE_SCHEMA:
        raise ValueError("completion receipt does not contain a valid dispatcher state")
    if completion.get("spec_sha256") != state.get("spec_sha256"):
        raise ValueError("completion recipe hash differs from its state")
    if completion.get("state_sha256") != _sha256_bytes(_canonical(state)):
        raise ValueError("completion state checksum mismatch")
    spec_path = pathlib.Path(state.get("spec_path", ""))
    try:
        observed_spec_sha256 = _sha256_bytes(spec_path.read_bytes())
    except OSError as exc:
        raise ValueError(f"completion recipe is unavailable: {exc}") from exc
    if observed_spec_sha256 != completion.get("spec_sha256"):
        raise ValueError("completion recipe hash mismatch")
    _validate_complete_state(state)
    expected_receipts = _accepted_receipt_bindings(run_dir, state)
    if completion.get("accepted_receipts") != expected_receipts:
        raise ValueError("completion accepted receipt bindings mismatch")
    return completion


def read_committed_state(run_dir: pathlib.Path) -> dict[str, Any]:
    """Return the validated completion state, or the current state before completion."""
    run_dir = pathlib.Path(run_dir).expanduser().resolve()
    if (run_dir / COMPLETION_NAME).exists():
        return _read_completion(run_dir)["state"]
    return _load_state(run_dir)


def _write_json_once(path: pathlib.Path, data: Any) -> None:
    """Atomically create one immutable JSON file without replacing an existing one."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{os.getpid()}.{threading.get_ident()}.{time.time_ns()}.tmp")
    try:
        with temp.open("x", encoding="utf-8") as stream:
            json.dump(data, stream, indent=2, ensure_ascii=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temp, path)
        fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        temp.unlink(missing_ok=True)


def _commit_completion(run_dir: pathlib.Path, state: dict[str, Any]) -> dict[str, Any]:
    run_dir = pathlib.Path(run_dir).expanduser().resolve()
    path = run_dir / COMPLETION_NAME
    _validate_complete_state(state)
    if path.exists():
        existing = _read_completion(run_dir)
        if _canonical(existing["state"]) != _canonical(state):
            raise ValueError("completion receipt already exists for a different state")
        return existing
    receipts = _accepted_receipt_bindings(run_dir, state)
    completion = {
        "schema": COMPLETION_SCHEMA,
        "run_dir": str(run_dir),
        "spec_sha256": state["spec_sha256"],
        "state_sha256": _sha256_bytes(_canonical(state)),
        "state": state,
        "accepted_receipts": receipts,
        "committed_at": now(),
    }
    _write_json_once(path, completion)
    committed = _read_completion(run_dir)
    if committed.get("state_sha256") != completion["state_sha256"]:
        raise ValueError("completion receipt readback did not match the committed state")
    return committed


def _reconcile_completion_projection(run_dir: pathlib.Path, completion: dict[str, Any]) -> None:
    """Record any mutable alias mismatch, then restore state/event projections."""
    run_dir = pathlib.Path(run_dir).expanduser().resolve()
    state = completion["state"]
    state_path = run_dir / STATE_NAME
    events_path = run_dir / "events.jsonl"
    observed_state_sha256: str | None = None
    state_matches = False
    state_error: str | None = None
    try:
        raw_state = state_path.read_bytes()
        observed_state_sha256 = _sha256_bytes(raw_state)
        state_matches = json.loads(raw_state) == state
    except (OSError, json.JSONDecodeError) as exc:
        state_error = f"{type(exc).__name__}: {exc}"
    observed_events_sha256: str | None = None
    events_match = False
    events_error: str | None = None
    try:
        raw_events = events_path.read_bytes()
        observed_events_sha256 = _sha256_bytes(raw_events)
        observed_events = [json.loads(line) for line in raw_events.decode("utf-8").splitlines() if line.strip()]
        events_match = observed_events == state.get("events", [])
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        events_error = f"{type(exc).__name__}: {exc}"
    if state_matches and events_match:
        return

    observation_dir = run_dir / "completion-observations"
    observation = {
        "schema": "chainspot.dispatcher-completion-observation/v1",
        "run_dir": str(run_dir),
        "observed_at": now(),
        "completion_sha256": _file_sha256(run_dir / COMPLETION_NAME),
        "expected_state_sha256": completion["state_sha256"],
        "observed_state_file_sha256": observed_state_sha256,
        "state_error": state_error,
        "expected_events_sha256": _sha256_bytes(_event_projection_bytes(state.get("events", []))),
        "observed_events_file_sha256": observed_events_sha256,
        "events_error": events_error,
    }
    observation_path = observation_dir / f"{uuid.uuid4().hex}.json"
    _write_json_once(observation_path, observation)
    _persist(run_dir, state)
    healed_state = _read_mutable_state(run_dir)
    if healed_state != state:
        raise ValueError("mutable dispatcher state did not heal from completion receipt")
    try:
        healed_events = [json.loads(line) for line in events_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"event projection did not heal from completion receipt: {exc}") from exc
    if healed_events != state.get("events", []):
        raise ValueError("event projection did not heal from completion receipt")


@contextlib.contextmanager
def _coordinator_lock(run_dir: pathlib.Path) -> Iterator[None]:
    run_dir.mkdir(parents=True, exist_ok=True)
    lock_path = run_dir / ".dispatcher.lock"
    with lock_path.open("a+") as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RuntimeError(f"another coordinator owns run {run_dir}") from exc
        try:
            yield
        finally:
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def _roles_for(state: dict[str, Any], worker: str) -> set[str]:
    value = state["execution"].get("fixed_roles", {}).get(worker)
    if isinstance(value, str):
        return {value}
    if isinstance(value, list):
        return set(value)
    return set()


def _worker_eligible(state: dict[str, Any], job: dict[str, Any], worker: str) -> bool:
    if state["workers"][worker]["job"] is not None:
        return False
    configured_lanes = state["execution"].get("worker_lanes", {})
    if worker in configured_lanes and job.get("lane", "default") not in configured_lanes[worker]:
        return False
    if state["policy"] == "fixed":
        roles = _roles_for(state, worker)
        if job["kind"] not in roles and job.get("lane", "default") not in roles:
            return False
    if job["kind"] == "review":
        allowed = job.get("review_allow_workers")
        if allowed is not None and worker not in allowed:
            return False
        dependency = state["jobs"].get(job["depends_on"])
        if dependency is None or dependency["status"] != "done" or dependency.get("worker") == worker:
            return False
    else:
        allowed = job.get("allow_workers")
        if allowed is not None and worker not in allowed:
            return False
    return True


def _job_ready(state: dict[str, Any], job: dict[str, Any]) -> tuple[bool, str | None]:
    if job["status"] != "pending":
        return False, "job is not pending"
    if job["kind"] == "review":
        dependency = state["jobs"].get(job["depends_on"])
        if dependency is None:
            return False, "missing extraction dependency"
        if dependency["status"] == "blocked":
            return False, "extraction dependency is blocked"
        if dependency["status"] != "done":
            return False, "waiting for extraction receipt"
    elif job.get("depends_on"):
        dependency = state["jobs"].get(job["depends_on"])
        if dependency is None:
            return False, "missing declared dependency"
        dependency_root = state["jobs"].get(dependency.get("root_job_id", dependency["id"]))
        if dependency_root is None:
            return False, "missing dependency root"
        if dependency_root.get("final_status") == "blocked":
            return False, "dependency root is blocked"
        if dependency_root.get("final_status") != "accepted":
            return False, "waiting for final accepted dependency review"
    return True, None


def _eligible_map(state: dict[str, Any]) -> tuple[list[str], dict[str, list[str]], dict[str, str]]:
    ready: list[str] = []
    eligible: dict[str, list[str]] = {}
    reasons: dict[str, str] = {}
    for jid, job in state["jobs"].items():
        is_ready, reason = _job_ready(state, job)
        if not is_ready:
            if reason:
                reasons[jid] = reason
            continue
        ready.append(jid)
        eligible[jid] = [worker for worker in state["workers"] if _worker_eligible(state, job, worker)]
        if not eligible[jid]:
            reasons[jid] = "no free worker satisfies lane, role, and packet eligibility"
    return ready, eligible, reasons


def _snapshot_view(state: dict[str, Any], decision_id: str | None = None) -> dict[str, Any]:
    """Observable scheduling state, normalizing expected starts from one solve batch."""
    normalized = state
    if decision_id is not None:
        normalized = copy.deepcopy(state)
        for worker, record in normalized["workers"].items():
            if record.get("decision_id") == decision_id:
                record.update(job=None, attempt_id=None, role=None, decision_id=None)
        for job in normalized["jobs"].values():
            if (job.get("active_attempt") or {}).get("decision_id") == decision_id:
                job.update(status="pending", worker=None, active_attempt=None, started_at=None)
    workers: dict[str, dict[str, Any]] = {}
    for worker, record in normalized["workers"].items():
        workers[worker] = {"job": record.get("job")}
    jobs: list[dict[str, Any]] = []
    for jid, job in normalized["jobs"].items():
        accepted_receipts = []
        for attempt in job.get("attempts", []):
            if attempt.get("accepted"):
                accepted_receipts.append({
                    "attempt_id": attempt.get("attempt_id"),
                    "receipt_sha256": attempt.get("receipt_sha256"),
                    "decision": attempt.get("decision"),
                })
        jobs.append({
            "id": jid, "kind": job["kind"], "status": job["status"],
            "depends_on": job.get("depends_on"), "root_job_id": job.get("root_job_id"),
            "repair_of": job.get("repair_of"), "worker": job.get("worker"),
            "accepted_receipts": accepted_receipts,
        })
    ready, eligible, reasons = _eligible_map(normalized)
    priorities = {
        jid: normalized.get("native_policy", {}).get("repair_priority", 300) if job.get("repair_of")
        else normalized.get("native_policy", {}).get("review_priority", 200) if job["kind"] == "review"
        else normalized.get("native_policy", {}).get("extract_priority", 100)
        for jid, job in normalized["jobs"].items() if job["status"] == "pending"
    }
    pinned = {worker: record["job"] for worker, record in normalized["workers"].items() if record.get("job")}
    input_bindings: dict[str, str] = {}
    for jid, job in normalized["jobs"].items():
        if job["status"] != "pending":
            continue
        extraction = None
        if job["kind"] == "review":
            dependency = normalized["jobs"].get(job.get("depends_on"))
            if dependency is not None and dependency["status"] == "done":
                extraction = _receipt_for_dependency(normalized, dependency)
        input_bindings[jid] = input_digest(_packet_job_for(job), extraction)
    return {
        "jobs": jobs,
        "workers": workers,
        "pinned_workers": pinned,
        "ready_jobs": ready,
        "eligible_workers": eligible,
        "blocked_reasons": reasons,
        "priorities": priorities,
        "capacities": {"each_ready_job": 1, "each_worker": 1, "bench": len(normalized["workers"])},
        "input_bindings": input_bindings,
        "eligibility_config": {
            "worker_lanes": normalized["execution"].get("worker_lanes", {}),
            "fixed_roles": normalized["execution"].get("fixed_roles", {}),
            "job_constraints": {
                jid: {
                    "lane": job.get("lane", "default"),
                    "allow_workers": job.get("allow_workers"),
                    "review_allow_workers": job.get("review_allow_workers"),
                }
                for jid, job in normalized["jobs"].items()
            },
        },
        "policy": state["policy"],
    }


def _snapshot_hash(snapshot: dict[str, Any]) -> str:
    return _sha256_bytes(_canonical(snapshot))


def _build_solver_state(state: dict[str, Any], ready: list[str], eligible: dict[str, list[str]]) -> dict[str, Any]:
    native_jobs: dict[str, dict[str, Any]] = {}
    for jid, job in state["jobs"].items():
        native_jobs[jid] = {
            "id": jid,
            "kind": job["kind"],
            "depends_on": job.get("depends_on"),
            "repair_of": job.get("repair_of"),
            "allow_workers": eligible.get(jid, []) if job["status"] == "pending" else [],
            "status": job["status"],
            "worker": job.get("worker"),
        }
    return {
        "schema": "chainspot.rebalancer-state/v1",
        "service": state.get("service", {}),
        "workers": {
            worker: {"job": record.get("job"), "agent": record.get("attempt_id")}
            for worker, record in state["workers"].items()
        },
        "jobs": native_jobs,
        "events": [],
        "epoch": state["solve_count"],
        "policy": state.get("native_policy", {"extract_priority": 100, "review_priority": 200, "repair_priority": 300}),
    }


def _packet_job_for(job: dict[str, Any]) -> dict[str, Any]:
    packet_job = _clean_job(job)
    packet_job.update({"id": job["id"], "kind": job["kind"], "lane": job.get("lane", "default")})
    if job["kind"] == "review":
        packet_job["expected_declarations"] = job.get("expected_declarations")
    return packet_job


def _packet_for(job: dict[str, Any], worker: str, attempt_id: str, decision_id: str) -> dict[str, Any]:
    packet_job = _packet_job_for(job)
    extraction = job.get("_dependency_receipt") if job["kind"] == "review" else None
    if job["kind"] == "review" and not isinstance(extraction, dict):
        raise ValueError(f"review {job['id']} has no accepted extraction receipt")
    digest = input_digest(packet_job, extraction)
    packet = {
        "job_id": job["id"], "worker": worker, "attempt_id": attempt_id,
        "input_digest": digest, "decision_id": decision_id, "job": packet_job,
    }
    if extraction is not None:
        packet["extraction_receipt"] = extraction
    return packet


def _attempt_receipt_path(run_dir: pathlib.Path, job_id: str, attempt_id: str) -> pathlib.Path:
    return run_dir / "attempts" / job_id / attempt_id / "receipt.json"


def _receipt_for_dependency(state: dict[str, Any], extraction_job: dict[str, Any]) -> dict[str, Any]:
    data = extraction_job.get("receipt_data")
    if not isinstance(data, dict):
        path = extraction_job.get("receipt")
        if path:
            data = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"accepted extraction {extraction_job['id']} has no receipt data")
    return data


def _mark_root_blocked(state: dict[str, Any], job: dict[str, Any], reason: str) -> None:
    root_id = job.get("root_job_id", job["id"])
    root = state["jobs"].get(root_id)
    if root is not None and root.get("final_status") != "accepted":
        root["final_status"] = "blocked"
        root["blocked_reason"] = reason


def _parse_receipt_time(value: Any, label: str) -> dt.datetime:
    if not isinstance(value, str):
        raise ValueError(f"receipt {label} must be an ISO timestamp")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"receipt {label} must be an ISO timestamp") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"receipt {label} must include a timezone")
    return parsed


def _validate_receipt(receipt: Any, job: dict[str, Any], attempt: dict[str, Any]) -> None:
    if not isinstance(receipt, dict):
        raise ValueError("worker result must contain a JSON receipt object")
    expected = {
        "job_id": job["id"], "worker": attempt["worker"],
        "attempt_id": attempt["attempt_id"], "input_digest": attempt["input_digest"],
        "kind": job["kind"], "source_sha256": job["source_sha256"],
    }
    for key, value in expected.items():
        if receipt.get(key) != value:
            raise ValueError(f"receipt {key} does not match the active attempt")
    _validate_source(job)
    if not isinstance(receipt.get("summary"), str) or not receipt["summary"].strip():
        raise ValueError("receipt must include a non-empty summary")
    started = _parse_receipt_time(receipt.get("started_at"), "started_at")
    ended = _parse_receipt_time(receipt.get("ended_at"), "ended_at")
    if ended < started:
        raise ValueError("receipt ended_at precedes started_at")
    for field in ("work_seconds", "elapsed_seconds", "simulated_service_seconds"):
        value = receipt.get(field)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value < 0:
            raise ValueError(f"receipt {field} must be a finite non-negative number")
    if receipt["elapsed_seconds"] + 0.002 < receipt["work_seconds"]:
        raise ValueError("receipt elapsed_seconds cannot be less than work_seconds")

    if job["kind"] == "extract":
        if receipt.get("outcome") != "extracted":
            raise ValueError("extraction receipt has an unknown outcome")
        declarations = receipt.get("declarations")
        if not isinstance(declarations, list):
            raise ValueError("extraction receipt declarations must be a list")
        source = pathlib.Path(job["source_path"]).read_text(encoding="utf-8")
        lines = source.splitlines(keepends=True)
        offsets: list[int] = []
        total = 0
        for line in lines:
            offsets.append(total)
            total += len(line)
        for declaration in declarations:
            if not isinstance(declaration, dict):
                raise ValueError("each declaration must be an object")
            name, line, quote = declaration.get("name"), declaration.get("line"), declaration.get("quote")
            if not isinstance(name, str) or not name.strip() or not isinstance(line, int) or isinstance(line, bool) or not isinstance(quote, str) or not quote:
                raise ValueError("declaration name, line, and quote are required")
            if line < 1 or line > len(lines):
                raise ValueError(f"declaration {name!r} points outside the source")
            start_offset = offsets[line - 1]
            if not source.startswith(quote, start_offset):
                raise ValueError(f"declaration quote for {name!r} does not match source line {line}")
    else:
        if receipt.get("decision") not in {"accepted", "amend"}:
            raise ValueError("review receipt decision must be accepted or amend")
        discrepancies = receipt.get("discrepancies")
        if not isinstance(discrepancies, list) or any(
            not (isinstance(item, str) and item.strip())
            and not (isinstance(item, dict) and isinstance(item.get("code"), str) and isinstance(item.get("detail"), str))
            for item in discrepancies
        ):
            raise ValueError("review discrepancies must contain strings or code/detail objects")
        extraction = attempt.get("packet", {}).get("extraction_receipt")
        if not isinstance(extraction, dict) or receipt.get("extraction_receipt_sha256") != receipt_digest(extraction):
            raise ValueError("review receipt is not bound to the exact extraction receipt")
        if extraction.get("worker") == attempt["worker"]:
            raise ValueError("reviewer must differ from the extraction author")
        if (receipt["decision"] == "accepted") != (len(discrepancies) == 0):
            raise ValueError("review decision and discrepancy list disagree")
        if not callable(validate_review_evidence):
            raise ValueError("review evidence validator is unavailable; refusing to accept review receipt")
        validate_review_evidence(attempt["packet"], receipt)


def _mark_attempt_rejected(state: dict[str, Any], run_dir: pathlib.Path, job: dict[str, Any], attempt: dict[str, Any], reason: str, *, event_type: str = "receipt_rejected") -> None:
    attempt_record = next((item for item in job["attempts"] if item["attempt_id"] == attempt["attempt_id"]), None)
    if attempt_record is not None:
        attempt_record.update(status="rejected", accepted=False, rejection_reason=reason, finished_at=now())
    worker = attempt["worker"]
    if state["workers"][worker].get("attempt_id") == attempt["attempt_id"]:
        state["workers"][worker].update(job=None, attempt_id=None, role=None, decision_id=None)
    if (job.get("active_attempt") or {}).get("attempt_id") == attempt["attempt_id"]:
        job.update(status="pending", worker=None, active_attempt=None, started_at=None)
    _append_event(state, event_type, job=job["id"], worker=worker, attempt_id=attempt["attempt_id"], reason=reason)
    job["attempts_used"] = job.get("attempts_used", 0) + 1
    if job["attempts_used"] >= job.get("max_attempts", state["execution"]["max_attempts"]):
        job.update(status="blocked", blocked_reason=f"maximum attempts reached after invalid receipt: {reason}")
        _mark_root_blocked(state, job, job["blocked_reason"])
        _append_event(state, "job_blocked", job=job["id"], reason=job["blocked_reason"])
    _persist(run_dir, state)


def _accept_receipt(state: dict[str, Any], run_dir: pathlib.Path, job: dict[str, Any], attempt: dict[str, Any], receipt: dict[str, Any], receipt_path: pathlib.Path, *, recovery: bool = False) -> None:
    if job["status"] != "running" or (job.get("active_attempt") or {}).get("attempt_id") != attempt["attempt_id"]:
        _event(state, run_dir, "receipt_rejected", job=job["id"], worker=attempt["worker"], attempt_id=attempt["attempt_id"], reason="late or duplicate receipt")
        return
    try:
        _validate_receipt(receipt, job, attempt)
        packet = attempt.get("packet")
        if not isinstance(packet, dict) or packet.get("input_digest") != attempt["input_digest"]:
            raise ValueError("stored packet digest is inconsistent")
        packet_path = pathlib.Path(attempt.get("packet_path", ""))
        if not packet_path.is_file() or json.loads(packet_path.read_text(encoding="utf-8")) != packet:
            raise ValueError("durable packet file differs from active attempt inputs")
        authoritative_job = _packet_job_for(job)
        extraction = None
        if job["kind"] == "review":
            extraction = _receipt_for_dependency(state, state["jobs"][job["depends_on"]])
            if packet.get("extraction_receipt") != extraction:
                raise ValueError("attempt packet extraction receipt differs from the accepted dependency receipt")
        if packet.get("job") != authoritative_job:
            raise ValueError("attempt packet differs from authoritative current job inputs")
        if input_digest(authoritative_job, extraction) != attempt["input_digest"]:
            raise ValueError("attempt input digest does not match authoritative current inputs")
    except Exception as exc:
        _mark_attempt_rejected(state, run_dir, job, attempt, str(exc), event_type="receipt_rejected")
        return

    arrival_at, arrival_mono = now(), time.monotonic()
    digest = receipt_digest(receipt)
    attempt_record = next((item for item in job["attempts"] if item["attempt_id"] == attempt["attempt_id"]), None)
    if attempt_record is not None:
        attempt_record.update(status="accepted", accepted=True, receipt_sha256=digest, finished_at=arrival_at)
        if job["kind"] == "review":
            attempt_record["decision"] = receipt["decision"]
    job.update(
        status="done", finished_at=arrival_at, receipt=str(receipt_path.resolve()),
        receipt_sha256=digest, receipt_data=receipt, active_attempt=None,
    )
    worker_record = state["workers"][attempt["worker"]]
    worker_record.update(job=None, attempt_id=None, role=None, decision_id=None)
    turnaround = None
    if attempt.get("session_id") == state.get("session_id") and attempt.get("process_id") == os.getpid():
        turnaround = max(0.0, arrival_mono - attempt["dispatch_requested_monotonic"])
    _append_event(state, "worker_timing_observed", job=job["id"], worker=attempt["worker"], attempt_id=attempt["attempt_id"], worker_started_at=receipt["started_at"], receipt_arrived_at=arrival_at, observed_at=arrival_at, receipt_arrived_monotonic=arrival_mono, turnaround_seconds=turnaround)
    _append_event(state, "receipt_accepted" if not recovery else "recovery_receipt_accepted", job=job["id"], worker=attempt["worker"], attempt_id=attempt["attempt_id"], receipt_sha256=digest, receipt_path=str(receipt_path.resolve()))
    _append_event(state, "receipt_arrived", job=job["id"], worker=attempt["worker"], attempt_id=attempt["attempt_id"], receipt_arrived_at=arrival_at, receipt_arrived_monotonic=arrival_mono)

    if job["kind"] == "review":
        root_id = job["root_job_id"]
        if receipt["decision"] == "accepted":
            state["final_reviews"][root_id] = job["id"]
            state["jobs"][root_id]["final_status"] = "accepted"
            _append_event(state, "final_acceptance", root_job_id=root_id, review_job=job["id"], receipt_sha256=digest)
        else:
            root = state["jobs"][root_id]
            repairs = root.get("repair_count", 0)
            maximum = state["execution"]["max_repairs"]
            if repairs < maximum:
                _create_repair(state, run_dir, root, {"id": job["id"], **receipt})
            else:
                root["final_status"] = "blocked"
                root["blocked_reason"] = "maximum repairs reached after amended review"
                _append_event(state, "job_blocked", job=root_id, reason=root["blocked_reason"])
    elif not state["review_enabled"]:
        root_id = job.get("root_job_id", job["id"])
        state["final_reviews"][root_id] = None
        state["jobs"][root_id]["final_status"] = "accepted"
        _append_event(state, "final_acceptance", root_job_id=root_id, review_job=None, receipt_sha256=digest)
    _persist(run_dir, state)


def _create_repair(state: dict[str, Any], run_dir: pathlib.Path, root: dict[str, Any], failed_review: dict[str, Any]) -> None:
    repair_number = root.get("repair_count", 0) + 1
    repair_id = f"{root['id']}.fix{repair_number}"
    probe.validate_token(repair_id, "repair job id")
    review_id = _review_id(repair_id, state["review_prefix"])
    if repair_id in state["jobs"] or review_id in state["jobs"]:
        raise ValueError(f"repair id collision: {repair_id}")
    repair = {
        **_clean_job(root),
        "id": repair_id,
        "kind": "extract",
        "root_job_id": root["id"],
        "repair_of": root["id"],
        "repair_number": repair_number,
        "inject_fault": False,
        "repair_reason_review": failed_review.get("id"),
        "status": "pending",
        "worker": None,
        "started_at": None,
        "finished_at": None,
        "attempt_number": 0,
        "attempts_used": 0,
        "attempts": [],
        "active_attempt": None,
        "max_attempts": state["execution"]["max_attempts"],
        "repair_count": 0,
    }
    _validate_source(repair)
    state["jobs"][repair_id] = repair
    if state["review_enabled"]:
        review = _make_review(repair, state["review_prefix"])
        state["jobs"][review["id"]] = review
    root["repair_count"] = repair_number
    _append_event(state, "repair_created", root_job_id=root["id"], repair_job=repair_id, review_job=review_id if state["review_enabled"] else None, failed_review=failed_review.get("id"), reason=failed_review.get("discrepancies", []))


def _prepare_attempt(state: dict[str, Any], run_dir: pathlib.Path, job: dict[str, Any], worker: str, decision: dict[str, Any]) -> dict[str, Any]:
    job["attempt_number"] += 1
    attempt_id = f"{job['id']}.a{job['attempt_number']}.{state['session_id'][:8]}"
    dependency_receipt = None
    if job["kind"] == "review":
        dependency_receipt = _receipt_for_dependency(state, state["jobs"][job["depends_on"]])
        job_with_dependency = {**job, "_dependency_receipt": dependency_receipt}
    else:
        job_with_dependency = job
    _validate_source(job)
    packet = _packet_for(job_with_dependency, worker, attempt_id, decision["decision_id"])
    packet_path = run_dir / "attempts" / job["id"] / attempt_id / "packet.json"
    write_json(packet_path, packet)
    worker_record = state["workers"][worker]
    previous_role = worker_record.get("last_role")
    worker_record["last_role"] = job["kind"]
    attempt = {
        "attempt_id": attempt_id,
        "worker": worker,
        "decision_id": decision["decision_id"],
        "input_digest": packet["input_digest"],
        "packet": packet,
        "packet_path": str(packet_path.resolve()),
        "dispatch_requested_at": now(),
        "dispatch_requested_monotonic": time.monotonic(),
        "session_id": state["session_id"],
        "process_id": os.getpid(),
    }
    job["active_attempt"] = attempt
    job["worker"] = worker
    job["status"] = "running"
    job["started_at"] = attempt["dispatch_requested_at"]
    job["attempts"].append({
        "attempt_id": attempt_id, "worker": worker, "decision_id": decision["decision_id"],
        "input_digest": packet["input_digest"], "status": "running", "accepted": False,
        "dispatch_requested_at": attempt["dispatch_requested_at"],
    })
    state["workers"][worker].update(job=job["id"], attempt_id=attempt_id, role=job["kind"], decision_id=decision["decision_id"])
    if state["policy"] == "dynamic" and previous_role is not None and previous_role != job["kind"]:
        _event(state, run_dir, "allocation_kind_changed", worker=worker, previous_kind=previous_role, new_kind=job["kind"], job=job["id"], decision_id=decision["decision_id"], reason="native solver assigned newly eligible pending work")
    _event(state, run_dir, "dispatch_requested", job=job["id"], worker=worker, attempt_id=attempt_id, input_digest=packet["input_digest"], decision_id=decision["decision_id"], allocation_kind=state["policy"])
    return packet


def _dispatch_batch(state: dict[str, Any], run_dir: pathlib.Path, report: dict[str, Any], decision: dict[str, Any], executor: concurrent.futures.ThreadPoolExecutor, futures: dict[concurrent.futures.Future, dict[str, Any]], deadline: float) -> int:
    dispatch_started = time.monotonic()
    dispatch = report.get("dispatch", {})
    current_hash = _snapshot_hash(_snapshot_view(state, decision["decision_id"]))
    if current_hash != decision["snapshot_hash"]:
        _event(state, run_dir, "stale_recommendation_rejected", decision_id=decision["decision_id"], expected_hash=decision["snapshot_hash"], observed_hash=current_hash)
        return 0
    created = 0
    for worker, job_id in dispatch.items():
        if time.monotonic() >= deadline:
            break
        current_hash = _snapshot_hash(_snapshot_view(state, decision["decision_id"]))
        if current_hash != decision["snapshot_hash"]:
            _event(state, run_dir, "stale_recommendation_rejected", decision_id=decision["decision_id"], worker=worker, job=job_id, expected_hash=decision["snapshot_hash"], observed_hash=current_hash)
            break
        if report.get("eligible", {}).get(job_id) is None or worker not in report["eligible"].get(job_id, []):
            _event(state, run_dir, "stale_recommendation_rejected", decision_id=decision["decision_id"], worker=worker, job=job_id, reason="worker no longer eligible")
            continue
        job = state["jobs"].get(job_id)
        if job is None or job["status"] != "pending" or not _worker_eligible(state, job, worker):
            _event(state, run_dir, "stale_recommendation_rejected", decision_id=decision["decision_id"], worker=worker, job=job_id, reason="job or worker state changed")
            continue
        try:
            _validate_source(job)
            packet = _prepare_attempt(state, run_dir, job, worker, decision)
        except (ValueError, FileNotFoundError) as exc:
            job.update(status="blocked", blocked_reason=f"current packet input is invalid: {exc}")
            _mark_root_blocked(state, job, job["blocked_reason"])
            _event(state, run_dir, "job_blocked", job=job_id, reason=job["blocked_reason"], decision_id=decision["decision_id"])
            break
        attempt = job["active_attempt"]
        cancel_event = threading.Event()
        worker_packet = {**packet, "cancel_event": cancel_event}
        future = executor.submit(execute, worker_packet)
        submitted_mono = time.monotonic()
        dispatch_seconds = max(0.0, submitted_mono - attempt["dispatch_requested_monotonic"])
        attempt_record = next(item for item in job["attempts"] if item["attempt_id"] == attempt["attempt_id"])
        attempt_record.update(dispatch_submitted_monotonic=submitted_mono, dispatch_seconds=dispatch_seconds)
        futures[future] = {"job_id": job_id, "worker": worker, "attempt_id": attempt["attempt_id"], "cancel_event": cancel_event}
        _event(state, run_dir, "worker_submitted", job=job_id, worker=worker, attempt_id=attempt["attempt_id"], decision_id=decision["decision_id"], dispatch_seconds=dispatch_seconds)
        created += 1
    batch_seconds = max(0.0, time.monotonic() - dispatch_started)
    if created:
        _event(state, run_dir, "dispatch_batch_complete", decision_id=decision["decision_id"], dispatch_seconds=batch_seconds, dispatch_count=created)
    _persist(run_dir, state)
    return created


def _release_without_receipt(state: dict[str, Any], run_dir: pathlib.Path, job: dict[str, Any], reason: str, *, abandoned: bool = False) -> None:
    attempt = job.get("active_attempt")
    if not attempt:
        return
    attempt_record = next((item for item in job["attempts"] if item["attempt_id"] == attempt["attempt_id"]), None)
    if attempt_record is not None:
        attempt_record.update(status="abandoned" if abandoned else "failed", accepted=False, rejection_reason=reason, finished_at=now())
    worker = attempt["worker"]
    state["workers"][worker].update(job=None, attempt_id=None, role=None, decision_id=None)
    job.update(status="pending", worker=None, active_attempt=None, started_at=None)
    _append_event(state, "attempt_abandoned" if abandoned else "attempt_failed", job=job["id"], worker=worker, attempt_id=attempt["attempt_id"], reason=reason)
    if not abandoned:
        job["attempts_used"] = job.get("attempts_used", 0) + 1
    if job.get("attempts_used", 0) >= job.get("max_attempts", state["execution"]["max_attempts"]):
        job.update(status="blocked", blocked_reason=f"maximum attempts reached: {reason}")
        _mark_root_blocked(state, job, job["blocked_reason"])
        _append_event(state, "job_blocked", job=job["id"], reason=job["blocked_reason"])
    _persist(run_dir, state)


def _recover(state: dict[str, Any], run_dir: pathlib.Path) -> None:
    running = [job for job in state["jobs"].values() if job["status"] == "running" and job.get("active_attempt")]
    for job in running:
        attempt = job["active_attempt"]
        path = _attempt_receipt_path(run_dir, job["id"], attempt["attempt_id"])
        if path.is_file():
            try:
                receipt = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                _mark_attempt_rejected(state, run_dir, job, attempt, f"durable receipt cannot be read: {exc}")
            else:
                _accept_receipt(state, run_dir, job, attempt, receipt, path, recovery=True)
        else:
            _release_without_receipt(state, run_dir, job, "coordinator resumed without a durable receipt", abandoned=True)
    _persist(run_dir, state)


def _block_unrunnable(state: dict[str, Any], run_dir: pathlib.Path, ready: list[str], eligible: dict[str, list[str]], reasons: dict[str, str]) -> bool:
    blocked_any = False
    for job_id in ready:
        job = state["jobs"][job_id]
        if job["status"] == "pending" and not eligible.get(job_id):
            reason = reasons.get(job_id, "no eligible free worker")
            job.update(status="blocked", blocked_reason=reason)
            _mark_root_blocked(state, job, reason)
            _event(state, run_dir, "job_blocked", job=job_id, reason=reason)
            blocked_any = True
    # A blocked extraction makes its review permanently un-runnable.
    for job in state["jobs"].values():
        if job["status"] == "pending" and job["kind"] == "review":
            dependency = state["jobs"].get(job["depends_on"])
            if dependency and dependency["status"] == "blocked":
                job.update(status="blocked", blocked_reason="extraction dependency is blocked")
                _mark_root_blocked(state, job, job["blocked_reason"])
                _event(state, run_dir, "job_blocked", job=job["id"], reason=job["blocked_reason"])
                blocked_any = True
        elif job["status"] == "pending" and job["kind"] == "extract" and job.get("depends_on"):
            dependency = state["jobs"].get(job["depends_on"])
            root = state["jobs"].get(dependency.get("root_job_id", dependency["id"])) if dependency else None
            if root and root.get("final_status") == "blocked":
                job.update(status="blocked", blocked_reason="declared dependency is blocked")
                _mark_root_blocked(state, job, job["blocked_reason"])
                _event(state, run_dir, "job_blocked", job=job["id"], reason=job["blocked_reason"])
                blocked_any = True
    return blocked_any


def _result_status(state: dict[str, Any]) -> str | None:
    roots = [job for job in state["jobs"].values() if job["kind"] == "extract" and not job.get("repair_of")]
    if roots and all(root.get("final_status") == "accepted" for root in roots):
        return "complete"
    if roots and all(root.get("final_status") in {"accepted", "blocked"} for root in roots) and any(root.get("final_status") == "blocked" for root in roots):
        return "blocked"
    return None


def _receipt_count(state: dict[str, Any]) -> int:
    return sum(1 for job in state["jobs"].values() for attempt in job.get("attempts", []) if attempt.get("accepted"))


def _record_result_received(state: dict[str, Any], run_dir: pathlib.Path, job: dict[str, Any], attempt: dict[str, Any], raw_result: Any) -> None:
    if isinstance(raw_result, dict) and isinstance(raw_result.get("receipt"), dict):
        receipt = raw_result["receipt"]
    else:
        receipt = raw_result
    path = _attempt_receipt_path(run_dir, job["id"], attempt["attempt_id"])
    try:
        write_json(path, receipt)
    except (TypeError, OSError) as exc:
        _release_without_receipt(state, run_dir, job, f"worker result is not durable JSON: {exc}")
        return
    attempt_record = next((item for item in job["attempts"] if item["attempt_id"] == attempt["attempt_id"]), None)
    if attempt_record is not None:
        attempt_record["receipt_path"] = str(path.resolve())
        attempt_record["receipt_arrived_at"] = now()
        attempt_record["receipt_arrived_monotonic"] = time.monotonic()
    _persist(run_dir, state)
    _event(state, run_dir, "worker_result_received", job=job["id"], worker=attempt["worker"], attempt_id=attempt["attempt_id"], receipt_path=str(path.resolve()))
    _accept_receipt(state, run_dir, job, attempt, receipt, path)


def _solve_once(state: dict[str, Any], run_dir: pathlib.Path) -> tuple[dict[str, Any], dict[str, Any]]:
    ready, eligible, reasons = _eligible_map(state)
    snapshot = _snapshot_view(state)
    snapshot["ready_jobs"] = ready
    snapshot["eligible_workers"] = eligible
    snapshot["blocked_reasons"] = reasons
    decision_id = f"D{state['decision_number'] + 1:04d}"
    decision = {
        "decision_id": decision_id,
        "revision": state["revision"],
        "snapshot_hash": _snapshot_hash(snapshot),
        "snapshot": snapshot,
        "policy": state["policy"],
    }
    decision_path = run_dir / "decisions" / f"{decision_id}.json"
    decision["decision_path"] = str(decision_path.resolve())
    write_json(decision_path, decision)
    state["decision_number"] += 1
    # Persist the visible decision inputs before invoking the native solver.
    _event(state, run_dir, "decision", decision_id=decision_id, decision_hash=decision["snapshot_hash"], revision=decision["revision"], policy=state["policy"], decision_path=str(decision_path.resolve()), snapshot=snapshot, reasons={"trigger": "startup_or_observable_completion", "blocked": reasons})
    solver_state = _build_solver_state(state, ready, eligible)
    solver_state_path = run_dir / "solver-input" / f"{decision_id}.json"
    probe.write_json(solver_state_path, solver_state)
    report = probe.solve(solver_state_path, run_dir / "solves")
    state["solve_count"] += 1
    _event(
        state, run_dir, "native_solve", decision_id=decision_id,
        native_epoch=report["epoch"], native_seconds=report["native_seconds"],
        assignment=report["assignments"], dispatch=report["dispatch"],
        exact_score=report["exact_score"],
        solver_input=str(solver_state_path.resolve()),
        report=str((run_dir / "solves" / f"epoch-{report['epoch']:02}.json").resolve()),
        bundle=str((run_dir / "solves" / f"epoch-{report['epoch']:02}.bundle").resolve()),
    )
    return report, decision


def run(run_dir: pathlib.Path, max_seconds: float = 30) -> dict[str, Any]:
    """Run or resume one bounded coordinator session."""
    if not isinstance(max_seconds, (int, float)) or isinstance(max_seconds, bool) or not math.isfinite(max_seconds) or max_seconds <= 0:
        raise ValueError("max_seconds must be a finite positive number")
    run_dir = pathlib.Path(run_dir).expanduser().resolve()
    started_mono = time.monotonic()
    started_at = now()
    with _coordinator_lock(run_dir):
        if (run_dir / COMPLETION_NAME).exists():
            completion = _read_completion(run_dir)
            _reconcile_completion_projection(run_dir, completion)
            return _run_result(completion["state"], "complete", started_at, started_mono, run_dir)
        state = _load_state(run_dir)
        session_id = uuid.uuid4().hex
        state["session_id"] = session_id
        state["process_id"] = os.getpid()
        _event(state, run_dir, "session_started", session_started_at=started_at, session_started_monotonic=started_mono, max_seconds=max_seconds)
        _recover(state, run_dir)
        status = _result_status(state)
        if status:
            if status == "complete":
                _commit_completion(run_dir, state)
            return _run_result(state, status, started_at, started_mono, run_dir)

        executor = concurrent.futures.ThreadPoolExecutor(max_workers=max(1, len(state["workers"])), thread_name_prefix="rebalancer-emulator")
        futures: dict[concurrent.futures.Future, dict[str, Any]] = {}
        deadline = started_mono + max_seconds
        result: dict[str, Any] | None = None
        try:
            while True:
                # Reap results before checking the time budget so already-finished
                # work can be made durable even at the boundary.
                completed = [future for future in futures if future.done()]
                for future in completed:
                    context = futures.pop(future)
                    job = state["jobs"].get(context["job_id"])
                    if job is None or (job.get("active_attempt") or {}).get("attempt_id") != context["attempt_id"]:
                        continue
                    attempt = job["active_attempt"]
                    try:
                        raw = future.result()
                    except BaseException as exc:
                        _release_without_receipt(state, run_dir, job, f"worker raised {type(exc).__name__}: {exc}")
                    else:
                        _record_result_received(state, run_dir, job, attempt, raw)

                status = _result_status(state)
                if status:
                    result = _run_result(state, status, started_at, started_mono, run_dir)
                    return result
                if time.monotonic() >= deadline:
                    _event(state, run_dir, "budget_exhausted", elapsed_seconds=time.monotonic() - started_mono, active_attempts=[ctx["attempt_id"] for ctx in futures.values()])
                    result = _run_result(state, "budget_exhausted", started_at, started_mono, run_dir)
                    return result

                ready, eligible, reasons = _eligible_map(state)
                if not ready:
                    if futures:
                        concurrent.futures.wait(futures, timeout=max(0.001, min(0.05, deadline - time.monotonic())), return_when=concurrent.futures.FIRST_COMPLETED)
                        continue
                    pending = [job for job in state["jobs"].values() if job["status"] == "pending"]
                    if pending:
                        for job in pending:
                            job.update(status="blocked", blocked_reason="no ready dependency path")
                            _mark_root_blocked(state, job, job["blocked_reason"])
                            _event(state, run_dir, "job_blocked", job=job["id"], reason=job["blocked_reason"])
                        status = _result_status(state) or "blocked"
                        result = _run_result(state, status, started_at, started_mono, run_dir)
                        return result
                    result = _run_result(state, _result_status(state) or "blocked", started_at, started_mono, run_dir)
                    return result

                has_free_eligible = any(eligible.get(job_id) for job_id in ready)
                if not has_free_eligible:
                    if futures:
                        concurrent.futures.wait(futures, timeout=max(0.001, min(0.05, deadline - time.monotonic())), return_when=concurrent.futures.FIRST_COMPLETED)
                        continue
                    if _block_unrunnable(state, run_dir, ready, eligible, reasons):
                        continue
                    result = _run_result(state, _result_status(state) or "blocked", started_at, started_mono, run_dir)
                    return result

                report, decision = _solve_once(state, run_dir)
                dispatched = _dispatch_batch(state, run_dir, report, decision, executor, futures, deadline)
                if dispatched:
                    continue
                if report.get("dispatch"):
                    _event(state, run_dir, "decision_aborted", decision_id=decision["decision_id"], reason="recommendation could not be applied")
                    continue
                if futures:
                    concurrent.futures.wait(futures, timeout=max(0.001, min(0.05, deadline - time.monotonic())), return_when=concurrent.futures.FIRST_COMPLETED)
                    continue
                ready, eligible, reasons = _eligible_map(state)
                _block_unrunnable(state, run_dir, ready, {jid: [] for jid in ready}, reasons | {jid: "native solver found no eligible assignment" for jid in ready})
                if _result_status(state):
                    result = _run_result(state, _result_status(state) or "blocked", started_at, started_mono, run_dir)
                    return result
        finally:
            # All delay waits are interruptible through this per-attempt signal.
            # Join before unlocking so a same-process resume cannot overlap old work.
            if futures:
                for context in futures.values():
                    context["cancel_event"].set()
            executor.shutdown(wait=True, cancel_futures=True)
            if futures:
                for future, context in list(futures.items()):
                    job = state["jobs"].get(context["job_id"])
                    if job is not None and (job.get("active_attempt") or {}).get("attempt_id") == context["attempt_id"]:
                        _release_without_receipt(state, run_dir, job, "session ended before receipt arrival", abandoned=True)
                _event(state, run_dir, "workers_drained", drained_attempts=[ctx["attempt_id"] for ctx in futures.values()])
            if result is not None:
                final_status = _result_status(state) or result["status"]
                if final_status == "complete":
                    _commit_completion(run_dir, state)
                # Include durable completion validation in the caller-visible
                # elapsed time and finished_at value.
                result.update(_run_result(state, final_status, started_at, started_mono, run_dir))


def _run_result(state: dict[str, Any], status: str, started_at: str, started_mono: float, run_dir: pathlib.Path) -> dict[str, Any]:
    elapsed = time.monotonic() - started_mono
    return {
        "status": status,
        "run_dir": str(run_dir),
        "started_at": started_at,
        "finished_at": now(),
        "elapsed_seconds": elapsed,
        "event_count": len(state["events"]),
        "receipt_count": _receipt_count(state),
        "native_solve_count": state["solve_count"],
        "final_reviews": dict(state["final_reviews"]),
        "session_id": state.get("session_id"),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    init_cmd = commands.add_parser("init", help="initialize a receipt-gated execution run")
    init_cmd.add_argument("--spec", required=True, type=pathlib.Path)
    init_cmd.add_argument("--run-dir", required=True, type=pathlib.Path)
    init_cmd.add_argument("--policy", choices=("dynamic", "fixed"), default="dynamic")
    run_cmd = commands.add_parser("run", help="run or resume the local dispatcher emulator")
    run_cmd.add_argument("--run-dir", required=True, type=pathlib.Path)
    run_cmd.add_argument("--max-seconds", type=float, default=30)
    args = parser.parse_args(argv)
    if args.command == "init":
        initialize(args.spec, args.run_dir, args.policy)
        result = {"status": "initialized", "run_dir": str(args.run_dir.resolve()), "policy": args.policy}
    else:
        result = run(args.run_dir, args.max_seconds)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, FileNotFoundError, FileExistsError, RuntimeError) as exc:
        print(f"dispatcher: {exc}", file=sys.stderr)
        raise SystemExit(2)
