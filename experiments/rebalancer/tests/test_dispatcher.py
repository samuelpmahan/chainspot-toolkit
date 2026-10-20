"""Behavioral tests for the local receipt-gated dispatcher emulator."""
from __future__ import annotations

import hashlib
import json
import threading
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from experiments.rebalancer import dispatcher, worker


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_spec(root: Path, *, inject_fault: bool = False, policy: str = "dynamic") -> Path:
    source = root / "source.py"
    source.write_text("def alpha(): return 1\n", encoding="utf-8")
    spec = {
        "schema": "chainspot.rebalancer-spec/v1",
        "service": {"name": "dispatcher-test"},
        "workers": ["W1", "W2"],
        "review_policy": {"enabled": True, "review_prefix": "R"},
        "jobs": [{
            "id": "E01", "kind": "extract", "lane": "core",
            "source_path": str(source), "source_sha256": sha256(source),
            "allow_workers": ["W1", "W2"], "review_allow_workers": ["W1", "W2"],
            "inject_fault": inject_fault,
        }],
        "execution": {
            "worker_lanes": {"W1": ["core"], "W2": ["core"]},
            "fixed_roles": {"W1": "extract", "W2": "review"},
            "max_attempts": 3,
            "max_repairs": 1,
        },
    }
    path = root / "spec.json"
    path.write_text(json.dumps(spec), encoding="utf-8")
    return path


def make_multi_spec(root: Path, count: int = 3, *, review_enabled: bool = False, delay: float = 0) -> Path:
    path = make_spec(root)
    spec = json.loads(path.read_text(encoding="utf-8"))
    spec["review_policy"]["enabled"] = review_enabled
    first = spec["jobs"][0]
    first["emulator_seconds"] = delay
    for index in range(2, count + 1):
        job = dict(first)
        job["id"] = f"E{index:02d}"
        job["emulator_seconds"] = delay
        spec["jobs"].append(job)
    path.write_text(json.dumps(spec), encoding="utf-8")
    return path


def fake_worker(packet: dict) -> dict:
    """Return a small source-bound extraction or independent review receipt."""
    job = packet["job"]
    common = {
        "job_id": packet["job_id"], "worker": packet["worker"],
        "attempt_id": packet["attempt_id"], "input_digest": packet["input_digest"],
        "kind": job["kind"], "source_sha256": job["source_sha256"],
        "started_at": "2026-10-20T00:00:00+00:00",
        "ended_at": "2026-10-20T00:00:00.001000+00:00",
        "work_seconds": 0.001, "elapsed_seconds": 0.001, "simulated_service_seconds": 0.001,
    }
    if job["kind"] == "extract":
        declarations = [{"name": "alpha", "line": 1, "quote": "def alpha(): return 1"}]
        if job.get("inject_fault"):
            declarations = []
        return {"receipt": common | {
            "outcome": "extracted", "summary": "source-bound extraction",
            "declarations": declarations,
        }}
    # Use the real independent source auditor for review packets so the test
    # exercises the same factual gate as local worker receipts.
    return worker.execute(packet)


class DispatcherTests(unittest.TestCase):
    def test_dynamic_run_gates_review_and_completes_from_native_recommendations(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root)
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir, policy="dynamic")
            with patch.object(dispatcher, "execute", side_effect=fake_worker):
                result = dispatcher.run(run_dir, max_seconds=5)

            state = json.loads((run_dir / "state.json").read_text())
            self.assertEqual(result["status"], "complete")
            self.assertEqual(state["jobs"]["E01"]["status"], "done")
            self.assertEqual(state["jobs"]["R01"]["status"], "done")
            self.assertNotEqual(state["jobs"]["E01"]["worker"], state["jobs"]["R01"]["worker"])
            self.assertEqual(state["final_reviews"]["E01"], "R01")
            self.assertTrue(any(event["type"] == "receipt_accepted" for event in state["events"]))
            self.assertGreaterEqual(result["receipt_count"], 2)
            decision = next(event for event in state["events"] if event["type"] == "decision")
            native_solve = next(event for event in state["events"] if event["type"] == "native_solve")
            self.assertTrue(Path(decision["decision_path"]).is_file())
            self.assertTrue(Path(native_solve["solver_input"]).is_file())
            self.assertTrue(Path(native_solve["report"]).is_file())
            self.assertTrue(Path(native_solve["bundle"]).is_file())

    def test_review_amendment_creates_source_preserving_repair_then_accepts_latest_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root, inject_fault=True)
            spec_data = json.loads(spec.read_text(encoding="utf-8"))
            dependent = dict(spec_data["jobs"][0])
            dependent["id"] = "E02"
            dependent["inject_fault"] = False
            dependent["depends_on"] = "E01"
            spec_data["jobs"].append(dependent)
            spec.write_text(json.dumps(spec_data), encoding="utf-8")
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir, policy="dynamic")
            with patch.object(dispatcher, "execute", side_effect=fake_worker):
                result = dispatcher.run(run_dir, max_seconds=5)

            state = json.loads((run_dir / "state.json").read_text())
            self.assertEqual(result["status"], "complete")
            self.assertEqual(state["jobs"]["R01"]["receipt_data"]["decision"], "amend")
            self.assertEqual(state["jobs"]["E01.fix1"]["repair_of"], "E01")
            self.assertFalse(state["jobs"]["E01.fix1"]["inject_fault"])
            self.assertEqual(state["jobs"]["E01.fix1"]["source_sha256"], state["jobs"]["E01"]["source_sha256"])
            self.assertEqual(state["jobs"]["R01.fix1"]["status"], "done")
            self.assertEqual(state["final_reviews"]["E01"], "R01.fix1")
            final_acceptance_index = next(
                index for index, event in enumerate(state["events"])
                if event["type"] == "final_acceptance" and event["root_job_id"] == "E01"
            )
            dependent_dispatch_index = next(
                index for index, event in enumerate(state["events"])
                if event["type"] == "dispatch_requested" and event["job"] == "E02"
            )
            self.assertLess(final_acceptance_index, dependent_dispatch_index)

    def test_fixed_roles_keep_extract_and_review_lanes_separate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root)
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir, policy="fixed")
            with patch.object(dispatcher, "execute", side_effect=fake_worker):
                result = dispatcher.run(run_dir, max_seconds=5)

            state = json.loads((run_dir / "state.json").read_text())
            self.assertEqual(result["status"], "complete")
            self.assertEqual(state["jobs"]["E01"]["worker"], "W1")
            self.assertEqual(state["jobs"]["R01"]["worker"], "W2")
            solve_events = [e for e in state["events"] if e["type"] == "decision"]
            self.assertTrue(solve_events)
            self.assertEqual(solve_events[0]["policy"], "fixed")

    def test_recovery_accepts_a_durable_matching_receipt_without_running_worker_again(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root)
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir)
            state_path = run_dir / "state.json"
            state = json.loads(state_path.read_text())
            job = state["jobs"]["E01"]
            attempt_id = "E01.a1.crash"
            packet_job = dispatcher._packet_job_for(job)
            digest = dispatcher.input_digest(packet_job, None)
            packet = {"job_id": "E01", "worker": "W1", "attempt_id": attempt_id,
                      "input_digest": digest, "decision_id": "D0001", "job": packet_job}
            packet_path = run_dir / "attempts" / "E01" / attempt_id / "packet.json"
            dispatcher.write_json(packet_path, packet)
            active_attempt = {
                "attempt_id": attempt_id, "worker": "W1", "decision_id": "D0001",
                "input_digest": digest, "packet": packet, "packet_path": str(packet_path.resolve()),
                "dispatch_requested_monotonic": 1.0, "session_id": "old-session", "process_id": -1,
            }
            job.update(status="running", worker="W1", attempt_number=1, attempts_used=0, active_attempt=active_attempt)
            job["attempts"].append({"attempt_id": attempt_id, "worker": "W1", "status": "running", "accepted": False})
            state["workers"]["W1"].update(job="E01", attempt_id=attempt_id)
            dispatcher.write_json(state_path, state)
            receipt = fake_worker({
                **packet,
            })["receipt"]
            receipt_path = run_dir / "attempts" / "E01" / attempt_id / "receipt.json"
            dispatcher.write_json(receipt_path, receipt)

            with patch.object(dispatcher, "execute", side_effect=AssertionError("must recover receipt")):
                result = dispatcher.run(run_dir, max_seconds=5)

            recovered = json.loads(state_path.read_text())
            self.assertEqual(recovered["jobs"]["E01"]["status"], "done")
            self.assertTrue(any(e["type"] == "recovery_receipt_accepted" for e in recovered["events"]))
            self.assertGreaterEqual(result["receipt_count"], 1)

    def test_bad_receipts_are_rejected_and_bounded_by_max_attempts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root)
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir)

            def invalid_worker(packet: dict) -> dict:
                receipt = fake_worker(packet)["receipt"]
                receipt["attempt_id"] = "stale.attempt"
                return {"receipt": receipt}

            with patch.object(dispatcher, "execute", side_effect=invalid_worker):
                result = dispatcher.run(run_dir, max_seconds=5)

            state = json.loads((run_dir / "state.json").read_text())
            self.assertEqual(result["status"], "blocked")
            self.assertEqual(state["jobs"]["E01"]["status"], "blocked")
            rejects = [event for event in state["events"] if event["type"] == "receipt_rejected"]
            self.assertGreaterEqual(len(rejects), 1)
            self.assertLessEqual(state["jobs"]["E01"]["attempt_number"], 3)

    def test_stale_decision_is_rejected_when_priority_or_packet_inputs_change(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root)
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir)
            state = dispatcher._load_state(run_dir)
            state["session_id"] = "stale-test"
            report = {"dispatch": {"W1": "E01"}, "eligible": {"E01": ["W1"]}}
            executor = ThreadPoolExecutor(max_workers=1)
            futures = {}
            try:
                for mutation in (
                    lambda: state["native_policy"].update(extract_priority=999),
                    lambda: state["jobs"]["E01"].update(expected_declarations=["changed"]),
                ):
                    decision = {
                        "decision_id": "D0001",
                        "snapshot_hash": dispatcher._snapshot_hash(dispatcher._snapshot_view(state)),
                    }
                    mutation()
                    started = dispatcher._dispatch_batch(state, run_dir, report, decision, executor, futures, time.monotonic() + 2)
                    self.assertEqual(started, 0)
            finally:
                executor.shutdown(wait=True, cancel_futures=True)
            state = json.loads((run_dir / "state.json").read_text(encoding="utf-8"))
            self.assertEqual(state["jobs"]["E01"]["status"], "pending")
            self.assertEqual(sum(e["type"] == "stale_recommendation_rejected" for e in state["events"]), 2)

    def test_batch_capacity_and_fast_worker_backfill_while_slow_worker_stays_pinned(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_multi_spec(root, count=3, review_enabled=False)
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir)
            call_lock = threading.Lock()
            release_first = threading.Event()
            calls = 0
            first_job = None

            def controlled_worker(packet: dict) -> dict:
                nonlocal calls, first_job
                with call_lock:
                    calls += 1
                    ordinal = calls
                    if ordinal == 1:
                        first_job = packet["job_id"]
                if ordinal == 1:
                    if not release_first.wait(timeout=4):
                        raise TimeoutError("second-worker backfill did not arrive")
                elif ordinal == 3:
                    # The slow first task is released only after the coordinator
                    # has made a third assignment to the newly free worker.
                    release_first.set()
                return fake_worker(packet)

            with patch.object(dispatcher, "execute", side_effect=controlled_worker):
                result = dispatcher.run(run_dir, max_seconds=5)

            state = json.loads((run_dir / "state.json").read_text(encoding="utf-8"))
            requested = [event for event in state["events"] if event["type"] == "dispatch_requested"]
            first_batch = [event for event in requested if event["decision_id"] == requested[0]["decision_id"]]
            self.assertEqual(len(first_batch), 2)
            self.assertEqual(len({event["worker"] for event in first_batch}), 2)
            self.assertEqual(result["status"], "complete")
            backfill = next(event for event in requested if event["job"] not in {item["job"] for item in first_batch})
            first_attempt = next(item for item in state["jobs"][first_job]["attempts"] if item["status"] == "accepted")
            self.assertLess(
                state["events"].index(backfill),
                next(index for index, event in enumerate(state["events"]) if event["type"] == "receipt_arrived" and event["attempt_id"] == first_attempt["attempt_id"]),
            )
            self.assertTrue(all(item.get("dispatch_seconds", -1) >= 0 for job in state["jobs"].values() for item in job["attempts"]))

    def test_ineligible_only_reviewer_blocks_root_without_acceptance(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root)
            spec_data = json.loads(spec.read_text(encoding="utf-8"))
            spec_data["workers"] = ["W1"]
            spec_data["jobs"][0]["allow_workers"] = ["W1"]
            spec_data["jobs"][0]["review_allow_workers"] = ["W1"]
            spec_data["execution"]["worker_lanes"] = {"W1": ["core"]}
            spec_data["execution"]["fixed_roles"] = {"W1": ["extract", "review"]}
            spec.write_text(json.dumps(spec_data), encoding="utf-8")
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir)
            with patch.object(dispatcher, "execute", side_effect=fake_worker):
                result = dispatcher.run(run_dir, max_seconds=5)
            state = json.loads((run_dir / "state.json").read_text(encoding="utf-8"))
            self.assertEqual(result["status"], "blocked")
            self.assertEqual(state["jobs"]["E01"]["final_status"], "blocked")
            self.assertEqual(state["jobs"]["R01"]["status"], "blocked")
            self.assertNotIn("E01", state["final_reviews"])

    def test_review_receipt_is_blocked_if_independent_validator_is_unavailable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root)
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir)
            with patch.object(dispatcher, "execute", side_effect=fake_worker), patch.object(dispatcher, "validate_review_evidence", None):
                result = dispatcher.run(run_dir, max_seconds=5)
            state = json.loads((run_dir / "state.json").read_text(encoding="utf-8"))
            rejected = [event for event in state["events"] if event["type"] == "receipt_rejected"]
            self.assertEqual(result["status"], "blocked")
            self.assertTrue(any("validator is unavailable" in event["reason"] for event in rejected))

    def test_relative_sources_resolve_only_from_explicit_source_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root)
            source = root / "source.py"
            spec_data = json.loads(spec.read_text(encoding="utf-8"))
            spec_data["source_root"] = "missing-source-root"
            spec_data["jobs"][0]["source_path"] = "source.py"
            spec.write_text(json.dumps(spec_data), encoding="utf-8")
            with self.assertRaisesRegex(FileNotFoundError, "configured source root"):
                dispatcher.initialize(spec, root / "run")

            source_root = root / "sources"
            source_root.mkdir()
            target = source_root / "source.py"
            target.write_bytes(source.read_bytes())
            spec_data["source_root"] = "sources"
            spec_data["jobs"][0]["source_sha256"] = sha256(target)
            spec.write_text(json.dumps(spec_data), encoding="utf-8")
            run_dir = root / "resolved-run"
            dispatcher.initialize(spec, run_dir)
            state = json.loads((run_dir / "state.json").read_text(encoding="utf-8"))
            self.assertEqual(state["jobs"]["E01"]["source_path"], str(target.resolve()))

    def test_missing_receipt_recovery_abandons_and_dispatches_a_fresh_fenced_attempt(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root)
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir)
            state_path = run_dir / "state.json"
            state = json.loads(state_path.read_text(encoding="utf-8"))
            job = state["jobs"]["E01"]
            attempt_id = "E01.a1.crash"
            packet_job = dispatcher._packet_job_for(job)
            digest = dispatcher.input_digest(packet_job, None)
            packet = {"job_id": "E01", "worker": "W1", "attempt_id": attempt_id,
                      "input_digest": digest, "decision_id": "D0001", "job": packet_job}
            packet_path = run_dir / "attempts" / "E01" / attempt_id / "packet.json"
            dispatcher.write_json(packet_path, packet)
            active_attempt = {
                "attempt_id": attempt_id, "worker": "W1", "decision_id": "D0001",
                "input_digest": digest, "packet": packet, "packet_path": str(packet_path.resolve()),
                "dispatch_requested_monotonic": 1.0, "session_id": "old-session", "process_id": -1,
            }
            job.update(status="running", worker="W1", attempt_number=1, attempts_used=0, active_attempt=active_attempt)
            job["attempts"].append({"attempt_id": attempt_id, "worker": "W1", "status": "running", "accepted": False})
            state["workers"]["W1"].update(job="E01", attempt_id=attempt_id, role="extract", decision_id="D0001")
            dispatcher.write_json(state_path, state)

            with patch.object(dispatcher, "execute", side_effect=fake_worker):
                result = dispatcher.run(run_dir, max_seconds=5)

            recovered = json.loads(state_path.read_text(encoding="utf-8"))
            attempts = recovered["jobs"]["E01"]["attempts"]
            self.assertEqual(result["status"], "complete")
            self.assertEqual(attempts[0]["status"], "abandoned")
            self.assertNotEqual(attempts[0]["attempt_id"], attempts[1]["attempt_id"])
            self.assertTrue(any(e["type"] == "attempt_abandoned" for e in recovered["events"]))

    def test_duplicate_receipt_after_completion_is_rejected_without_changing_acceptance(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root)
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir)
            with patch.object(dispatcher, "execute", side_effect=fake_worker):
                result = dispatcher.run(run_dir, max_seconds=5)
            self.assertEqual(result["status"], "complete")
            state = dispatcher._load_state(run_dir)
            job = state["jobs"]["E01"]
            accepted = next(item for item in job["attempts"] if item["accepted"])
            attempt_id = accepted["attempt_id"]
            receipt_path = run_dir / "attempts" / "E01" / attempt_id / "receipt.json"
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
            packet = json.loads((receipt_path.parent / "packet.json").read_text(encoding="utf-8"))
            attempt = {
                "attempt_id": attempt_id, "worker": accepted["worker"],
                "input_digest": accepted["input_digest"], "packet": packet,
            }
            before = state["jobs"]["E01"]["receipt_sha256"]
            dispatcher._accept_receipt(state, run_dir, job, attempt, receipt, receipt_path)
            self.assertEqual(job["status"], "done")
            self.assertEqual(job["receipt_sha256"], before)
            self.assertEqual(state["final_reviews"]["E01"], "R01")
            self.assertTrue(any(event["type"] == "receipt_rejected" and event.get("reason") == "late or duplicate receipt" for event in state["events"]))

    def test_budget_cancels_and_joins_workers_before_same_process_resume(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_multi_spec(root, count=1, review_enabled=True, delay=3)
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir)
            active_lock = threading.Lock()
            active = 0
            maximum_active = 0

            def tracked_worker(packet: dict) -> dict:
                nonlocal active, maximum_active
                with active_lock:
                    active += 1
                    maximum_active = max(maximum_active, active)
                try:
                    return worker.execute(packet)
                finally:
                    with active_lock:
                        active -= 1

            with patch.object(dispatcher, "execute", side_effect=tracked_worker):
                first = dispatcher.run(run_dir, max_seconds=0.6)
                self.assertEqual(first["status"], "budget_exhausted")
                after_budget = json.loads((run_dir / "state.json").read_text(encoding="utf-8"))
                self.assertTrue(any(event["type"] == "workers_drained" for event in after_budget["events"]))
                self.assertEqual(active, 0)
                second = dispatcher.run(run_dir, max_seconds=5)

            self.assertEqual(second["status"], "complete")
            self.assertLessEqual(maximum_active, 1)
            final_state = json.loads((run_dir / "state.json").read_text(encoding="utf-8"))
            self.assertTrue(any(attempt["status"] == "abandoned" for attempt in final_state["jobs"]["E01"]["attempts"]))

    def test_completion_receipt_recovers_rolled_back_projection_without_redispatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root)
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir)
            stale_state = (run_dir / "state.json").read_bytes()
            stale_events = (run_dir / "events.jsonl").read_bytes()

            with patch.object(dispatcher, "execute", side_effect=fake_worker):
                result = dispatcher.run(run_dir, max_seconds=5)

            completion_path = run_dir / "completion.json"
            self.assertEqual(result["status"], "complete")
            self.assertTrue(completion_path.is_file(), "a complete return needs a durable completion receipt")
            completion_bytes = completion_path.read_bytes()
            checkpoint = json.loads(completion_bytes)
            self.assertEqual(checkpoint["schema"], "chainspot.dispatcher-completion/v1")
            self.assertEqual(checkpoint["state"]["final_reviews"]["E01"], "R01")
            self.assertTrue(checkpoint["accepted_receipts"])

            # Simulate an external workspace sync replacing the mutable aliases
            # with an older, internally consistent projection.
            (run_dir / "state.json").write_bytes(stale_state)
            (run_dir / "events.jsonl").write_bytes(stale_events)
            committed = dispatcher.read_committed_state(run_dir)
            self.assertEqual(committed["final_reviews"]["E01"], "R01")

            with patch.object(dispatcher, "execute", side_effect=AssertionError("completed work must not be dispatched again")):
                resumed = dispatcher.run(run_dir, max_seconds=5)

            healed = dispatcher.read_committed_state(run_dir)
            observations = list((run_dir / "completion-observations").glob("*.json"))
            self.assertTrue(observations, "mutable rollback should be recorded before projection healing")
            self.assertEqual(resumed["status"], "complete")
            self.assertEqual(healed["final_reviews"], checkpoint["state"]["final_reviews"])
            self.assertEqual(json.loads((run_dir / "state.json").read_text())["final_reviews"], checkpoint["state"]["final_reviews"])
            self.assertEqual([json.loads(line) for line in (run_dir / "events.jsonl").read_text().splitlines()], checkpoint["state"]["events"])
            self.assertEqual(completion_path.read_bytes(), completion_bytes, "no-op recovery must preserve the original completion receipt")

    def test_completion_receipt_recovers_missing_mutable_projection(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root)
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir)
            with patch.object(dispatcher, "execute", side_effect=fake_worker):
                result = dispatcher.run(run_dir, max_seconds=5)
            self.assertEqual(result["status"], "complete")
            completion_bytes = (run_dir / "completion.json").read_bytes()
            (run_dir / "state.json").unlink()
            (run_dir / "events.jsonl").unlink()

            with patch.object(dispatcher, "execute", side_effect=AssertionError("completion recovery must not rerun workers")):
                resumed = dispatcher.run(run_dir, max_seconds=5)

            self.assertEqual(resumed["status"], "complete")
            recovered = json.loads((run_dir / "state.json").read_text(encoding="utf-8"))
            self.assertEqual(recovered["final_reviews"]["E01"], "R01")
            self.assertTrue((run_dir / "events.jsonl").is_file())
            self.assertEqual((run_dir / "completion.json").read_bytes(), completion_bytes)

    def test_completion_receipt_rejects_corrupt_state_checksum_and_accepted_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root)
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir)
            with patch.object(dispatcher, "execute", side_effect=fake_worker):
                self.assertEqual(dispatcher.run(run_dir, max_seconds=5)["status"], "complete")

            completion_path = run_dir / "completion.json"
            completion = json.loads(completion_path.read_text(encoding="utf-8"))
            completion["state_sha256"] = "0" * 64
            completion_path.write_text(json.dumps(completion), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "completion state checksum"):
                dispatcher.read_committed_state(run_dir)

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root)
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir)
            with patch.object(dispatcher, "execute", side_effect=fake_worker):
                self.assertEqual(dispatcher.run(run_dir, max_seconds=5)["status"], "complete")

            completion = json.loads((run_dir / "completion.json").read_text(encoding="utf-8"))
            receipt_path = run_dir / completion["accepted_receipts"][0]["path"]
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
            receipt["summary"] = "tampered after completion"
            receipt_path.write_text(json.dumps(receipt), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "accepted receipt hash"):
                dispatcher.read_committed_state(run_dir)

    def test_initialize_refuses_run_directory_with_completion_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = make_spec(root)
            run_dir = root / "run"
            dispatcher.initialize(spec, run_dir)
            with patch.object(dispatcher, "execute", side_effect=fake_worker):
                self.assertEqual(dispatcher.run(run_dir, max_seconds=5)["status"], "complete")
            self.assertTrue((run_dir / "completion.json").is_file())
            (run_dir / "state.json").unlink()

            with self.assertRaises(FileExistsError):
                dispatcher.initialize(spec, run_dir)


if __name__ == "__main__":
    unittest.main()
