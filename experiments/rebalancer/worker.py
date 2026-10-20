"""Deterministic, read-only extraction and review worker emulator.

The emulator performs real parsing and receipt checks locally. Configured delays
are reported as simulated service time; they are subtracted from measured
computation wall time. No source file is modified and no external model is called.
"""
from __future__ import annotations

import ast
import datetime as dt
import hashlib
import json
import math
import pathlib
import re
import time
from collections import Counter
from typing import Any


_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}\Z")
_HEX256 = re.compile(r"[0-9a-f]{64}\Z")


def _utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _token(value: Any, label: str) -> str:
    if not isinstance(value, str) or not _TOKEN.fullmatch(value):
        raise ValueError(f"{label} must be a safe token")
    return value


def _digest(value: Any, label: str) -> str:
    if not isinstance(value, str) or not _HEX256.fullmatch(value):
        raise ValueError(f"{label} must be a lowercase SHA-256 hex digest")
    return value


def _packet(packet: Any) -> tuple[str, str, str, str, dict[str, Any]]:
    if not isinstance(packet, dict):
        raise ValueError("packet must be an object")
    job_id = _token(packet.get("job_id"), "job_id")
    worker = _token(packet.get("worker"), "worker")
    attempt_id = _token(packet.get("attempt_id"), "attempt_id")
    input_digest = _digest(packet.get("input_digest"), "input_digest")
    job = packet.get("job")
    if not isinstance(job, dict):
        raise ValueError("job must be an object")
    if job.get("kind") not in {"extract", "review"}:
        raise ValueError("job.kind must be 'extract' or 'review'")
    source_path = job.get("source_path")
    if not isinstance(source_path, str) or not pathlib.Path(source_path).is_absolute():
        raise ValueError("job.source_path must be an absolute path")
    _digest(job.get("source_sha256"), "job.source_sha256")
    for field in ("emulator_seconds", "review_seconds"):
        duration = job.get(field, 0)
        if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration < 0:
            raise ValueError(f"job.{field} must be a non-negative number")
    if not isinstance(job.get("inject_fault", False), bool):
        raise ValueError("job.inject_fault must be boolean")
    expected = job.get("expected_declarations")
    if expected is not None and (
        not isinstance(expected, list)
        or any(not isinstance(name, str) or not name.isidentifier() for name in expected)
    ):
        raise ValueError("job.expected_declarations must be a list of Python names")
    return job_id, worker, attempt_id, input_digest, job


def _read_source(job: dict[str, Any], *, strict_hash: bool = True) -> tuple[bytes, str, str]:
    path = pathlib.Path(job["source_path"])
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise ValueError(f"could not read source: {path}") from exc
    actual_sha = hashlib.sha256(raw).hexdigest()
    if strict_hash and actual_sha != job["source_sha256"]:
        raise ValueError("source SHA-256 does not match packet")
    try:
        source = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("Python source must be UTF-8") from exc
    return raw, actual_sha, source


def _declarations(source: str) -> list[dict[str, Any]]:
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        raise ValueError(f"source is not valid Python: {exc.msg}") from exc
    rows = []
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        quote = ast.get_source_segment(source, node)
        if quote is None:
            raise ValueError(f"could not recover source for declaration {node.name}")
        rows.append({"name": node.name, "line": node.lineno, "quote": quote})
    return rows


def receipt_digest(receipt: dict[str, Any]) -> str:
    """Hash a receipt using stable JSON encoding, independent of key insertion order."""
    try:
        encoded = json.dumps(receipt, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ValueError("receipt must be JSON serializable") from exc
    return hashlib.sha256(encoded).hexdigest()


def _check_cancelled(packet: dict[str, Any]) -> Any:
    event = packet.get("cancel_event")
    if event is not None and (not callable(getattr(event, "is_set", None)) or not callable(getattr(event, "wait", None))):
        raise ValueError("packet.cancel_event must provide is_set() and wait(timeout)")
    if event is not None and event.is_set():
        raise RuntimeError("worker attempt cancelled by coordinator")
    return event


def _timed_receipt(packet: dict[str, Any], kind: str, started_at: str, *, strict_hash: bool = True) -> dict[str, Any]:
    job_id, worker, attempt_id, input_digest, job = _packet(packet)
    cancel_event = _check_cancelled(packet)
    _, source_sha, source = _read_source(job, strict_hash=strict_hash)
    declarations = _declarations(source)
    _check_cancelled(packet)
    delay = float(job["emulator_seconds"] if kind == "extract" else job["review_seconds"])
    delay_started = time.perf_counter()
    if delay and cancel_event is not None:
        if cancel_event.wait(delay):
            raise RuntimeError("worker attempt cancelled by coordinator")
    elif delay:
        time.sleep(delay)
    _check_cancelled(packet)
    base = {
        "job_id": job_id,
        "worker": worker,
        "attempt_id": attempt_id,
        "input_digest": input_digest,
        "kind": kind,
        "source_sha256": source_sha,
        "started_at": started_at,
        "simulated_service_seconds": delay,
    }
    return {"base": base, "declarations": declarations, "_simulated_wall_seconds": time.perf_counter() - delay_started}


def _extract(packet: dict[str, Any], started_at: str) -> dict[str, Any]:
    job_id, worker, attempt_id, input_digest, job = _packet(packet)
    data = _timed_receipt(packet, "extract", started_at)
    declarations = data["declarations"]
    if job.get("inject_fault") and declarations:
        # A deterministic, visible omission. Source bytes and hashes stay intact.
        declarations = declarations[:-1]
    receipt = {
        **data["base"],
        "_simulated_wall_seconds": data["_simulated_wall_seconds"],
        "outcome": "extracted",
        "declarations": declarations,
        "summary": f"Extracted {len(declarations)} top-level function declaration(s) from {pathlib.Path(job['source_path']).name}.",
    }
    return {"receipt": receipt}


def _review(packet: dict[str, Any], started_at: str) -> dict[str, Any]:
    job_id, worker, attempt_id, input_digest, job = _packet(packet)
    extraction = job.get("extraction_receipt", packet.get("extraction_receipt"))
    if not isinstance(extraction, dict):
        raise ValueError("review job requires an extraction_receipt object")
    if extraction.get("kind") != "extract":
        raise ValueError("extraction_receipt.kind must be 'extract'")
    if extraction.get("worker") == worker:
        raise ValueError("review requires an independent worker")
    expected_extract_id = job.get("extraction_job_id", job.get("depends_on"))
    if expected_extract_id is not None and extraction.get("job_id") != expected_extract_id:
        raise ValueError("extraction receipt job_id does not match review dependency")
    if not isinstance(extraction.get("declarations"), list):
        raise ValueError("extraction receipt declarations must be a list")

    data = _timed_receipt(packet, "review", started_at, strict_hash=False)
    actual = data["declarations"]
    discrepancies: list[dict[str, str]] = []

    def report(code: str, detail: str) -> None:
        discrepancies.append({"code": code, "detail": detail})

    if extraction.get("source_sha256") != data["base"]["source_sha256"]:
        report("source_hash_mismatch", "extraction receipt source hash differs from independently read source")
    if job["source_sha256"] != data["base"]["source_sha256"]:
        report("packet_source_hash_mismatch", "review packet source hash differs from independently read source")
    declared = extraction["declarations"]
    valid_declared = []
    for row in declared:
        if (
            not isinstance(row, dict)
            or not isinstance(row.get("name"), str)
            or not row["name"].isidentifier()
            or isinstance(row.get("line"), bool)
            or not isinstance(row.get("line"), int)
            or row["line"] < 1
            or not isinstance(row.get("quote"), str)
        ):
            report("malformed_declaration", "a declaration row has invalid name, line, or quote fields")
        else:
            valid_declared.append(row)
    # Preserve duplicates: a repeated function declaration is a distinct source occurrence.
    if Counter(row["name"] for row in valid_declared) != Counter(row["name"] for row in actual):
        report("declaration_set_mismatch", "declaration names or duplicate counts differ from the source")

    actual_by_key = Counter((row["name"], row["line"], row["quote"]) for row in actual)
    received_by_key = Counter(
        (row.get("name"), row.get("line"), row.get("quote"))
        for row in valid_declared
    )
    if actual_by_key != received_by_key:
        report("quote_mismatch", "one or more declaration names, line numbers, or exact source quotes differ")

    expected = job.get("expected_declarations")
    if expected is not None and Counter(expected) != Counter(row["name"] for row in actual):
        report("expected_declarations_mismatch", "packet expected declaration names differ from the source")

    receipt = {
        **data["base"],
        "_simulated_wall_seconds": data["_simulated_wall_seconds"],
        "extraction_receipt_sha256": receipt_digest(extraction),
        "decision": "accepted" if not discrepancies else "amend",
        "discrepancies": discrepancies,
        "summary": "Review accepted the extraction receipt." if not discrepancies else f"Review found {len(discrepancies)} discrepancy type(s).",
    }
    return {"receipt": receipt}


def execute(packet: dict[str, Any]) -> dict[str, Any]:
    """Execute one extraction or review packet and return its receipt."""
    started_at = _utc_now()
    started = time.perf_counter()
    _, _, _, _, job = _packet(packet)
    if job["kind"] == "extract":
        result = _extract(packet, started_at)
    else:
        result = _review(packet, started_at)
    receipt = result["receipt"]
    elapsed = time.perf_counter() - started
    simulated_wall = receipt.pop("_simulated_wall_seconds", 0.0)
    receipt["ended_at"] = _utc_now()
    receipt["elapsed_seconds"] = elapsed
    receipt["work_seconds"] = max(0.0, elapsed - simulated_wall)
    return result


def validate_review_evidence(packet: dict[str, Any], receipt: dict[str, Any]) -> bool:
    """Check a claimed review receipt against a fresh local source audit.

    This is read-only and performs no simulated wait. It lets the coordinator
    reject a forged `accepted` decision even when the extraction is malformed.
    """
    if not isinstance(receipt, dict):
        raise ValueError("review receipt must be an object")
    check_packet = json.loads(json.dumps({key: value for key, value in packet.items() if key != "cancel_event"}))
    job = check_packet.get("job")
    if not isinstance(job, dict):
        raise ValueError("review packet job must be an object")
    job["review_seconds"] = 0
    expected = execute(check_packet)["receipt"]
    fields = (
        "job_id", "worker", "attempt_id", "input_digest", "kind", "source_sha256",
        "extraction_receipt_sha256", "decision", "discrepancies",
    )
    if any(receipt.get(field) != expected.get(field) for field in fields):
        raise ValueError("review receipt does not match independently verified evidence")
    return True
