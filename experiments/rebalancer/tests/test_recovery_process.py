"""Process-level recovery checks for durable dispatcher boundaries."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from experiments.rebalancer import dispatcher, worker


REPO = Path(__file__).resolve().parents[3]


def _make_spec(root: Path, *, review: bool, delay: float = 0) -> Path:
    source = root / "source.py"
    source.write_text("def alpha():\n    return 1\n", encoding="utf-8")
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    spec = {
        "schema": "chainspot.rebalancer-spec/v1",
        "service": {"name": "process-recovery-test"},
        "workers": ["W1", "W2"],
        "review_policy": {"enabled": review, "review_prefix": "R"},
        "execution": {
            "max_attempts": 3,
            "max_repairs": 0,
            "worker_lanes": {"W1": ["core"], "W2": ["core"]},
            "fixed_roles": {"W1": "extract", "W2": "review"},
        },
        "jobs": [{
            "id": "E01", "kind": "extract", "lane": "core",
            "source_path": str(source.resolve()), "source_sha256": digest,
            "expected_declarations": ["alpha"],
            "emulator_seconds": delay, "review_seconds": 0.02,
        }],
    }
    spec_path = root / "spec.json"
    spec_path.write_text(json.dumps(spec), encoding="utf-8")
    return spec_path


def _wait_for(path: Path, predicate, timeout: float = 8) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists() and predicate():
            return True
        time.sleep(0.01)
    return False


class ProcessRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="rebalancer-process-test-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.run_dir = self.root / "run"
        self.state_path = self.run_dir / "state.json"
        self.marker = self.root / "gate.marker"
        self.env = dict(os.environ)
        self.env["PYTHONPATH"] = str(REPO)

    def initialize(self, *, review: bool, delay: float = 0):
        dispatcher.initialize(_make_spec(self.root, review=review, delay=delay), self.run_dir)

    def start_child(self, code: str | None = None):
        if code is None:
            command = [
                sys.executable, "-m", "experiments.rebalancer.dispatcher", "run",
                "--run-dir", str(self.run_dir), "--max-seconds", "5",
            ]
        else:
            command = [sys.executable, "-c", code, str(self.run_dir), str(self.marker)]
        return subprocess.Popen(
            command, cwd=REPO, env=self.env,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )

    def kill_at_marker(self, code: str):
        process = self.start_child(code)
        reached = _wait_for(self.marker, lambda: self.marker.is_file())
        if reached:
            process.kill()  # SIGKILL this test's own coordinator process.
        stdout, stderr = process.communicate(timeout=5)
        self.assertTrue(reached, f"child did not reach kill boundary\nstdout={stdout}\nstderr={stderr}")
        self.assertEqual(process.returncode, -9)

    def resume(self) -> dict:
        code = (
            "import json,sys; from pathlib import Path; "
            "from experiments.rebalancer import dispatcher; "
            "print(json.dumps(dispatcher.run(Path(sys.argv[1]), max_seconds=5)))"
        )
        completed = subprocess.run(
            [sys.executable, "-c", code, str(self.run_dir)],
            cwd=REPO, env=self.env, text=True, capture_output=True, timeout=15,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        return json.loads(completed.stdout)

    def test_sigkill_after_dispatch_recovers_by_reassigning_once(self):
        self.initialize(review=False, delay=1.5)
        child = self.start_child()
        reached = _wait_for(
            self.state_path,
            lambda: any(job["status"] == "running" for job in json.loads(self.state_path.read_text())["jobs"].values()),
        )
        if reached:
            child.kill()
        child.communicate(timeout=5)
        self.assertTrue(reached, "coordinator did not durably record dispatch")
        self.assertEqual(child.returncode, -9)

        result = self.resume()
        state = json.loads(self.state_path.read_text())
        attempts = state["jobs"]["E01"]["attempts"]
        self.assertEqual(result["status"], "complete")
        self.assertEqual([attempt["status"] for attempt in attempts], ["abandoned", "accepted"])
        self.assertEqual(sum(attempt["accepted"] for attempt in attempts), 1)

    def test_sigkill_after_durable_receipt_recovers_without_reexecution(self):
        self.initialize(review=False)
        code = """
import sys,time
from pathlib import Path
from experiments.rebalancer import dispatcher
run_dir=Path(sys.argv[1]); marker=Path(sys.argv[2])
def block_after_receipt(*args, **kwargs):
    receipt_path=args[5]
    marker.write_text(str(receipt_path.is_file()), encoding='utf-8')
    while True: time.sleep(0.02)
dispatcher._accept_receipt=block_after_receipt
dispatcher.run(run_dir, max_seconds=5)
"""
        self.kill_at_marker(code)
        self.assertEqual(self.marker.read_text(), "True")

        result = self.resume()
        state = json.loads(self.state_path.read_text())
        attempts = state["jobs"]["E01"]["attempts"]
        self.assertEqual(result["status"], "complete")
        self.assertEqual(len(attempts), 1)
        self.assertTrue(attempts[0]["accepted"])
        self.assertTrue(any(event["type"] == "recovery_receipt_accepted" for event in state["events"]))

    def test_sigkill_after_final_acceptance_persisted_resumes_as_complete(self):
        self.initialize(review=True)
        code = """
import sys,time
from pathlib import Path
from experiments.rebalancer import dispatcher
run_dir=Path(sys.argv[1]); marker=Path(sys.argv[2])
persist=dispatcher._persist
def block_after_final_persist(path, state):
    result=persist(path, state)
    if state.get('final_reviews', {}).get('E01') == 'R01':
        marker.write_text('persisted', encoding='utf-8')
        while True: time.sleep(0.02)
    return result
dispatcher._persist=block_after_final_persist
dispatcher.run(run_dir, max_seconds=5)
"""
        self.kill_at_marker(code)
        before = json.loads(self.state_path.read_text())
        self.assertEqual(before["jobs"]["E01"]["final_status"], "accepted")
        self.assertEqual(before["final_reviews"]["E01"], "R01")

        result = self.resume()
        after = json.loads(self.state_path.read_text())
        self.assertEqual(result["status"], "complete")
        self.assertEqual(result["receipt_count"], 2)
        self.assertEqual(len(after["jobs"]["R01"]["attempts"]), 1)

    def test_coordinator_rejects_forged_accepted_review_of_incomplete_extraction(self):
        source = self.root / "source.py"
        source.write_text("def alpha(): return 1\ndef beta(): return 2\n", encoding="utf-8")
        source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        extraction = {
            "job_id": "E01", "worker": "W1", "attempt_id": "E01.a1",
            "input_digest": "1" * 64, "kind": "extract", "source_sha256": source_hash,
            "outcome": "extracted", "summary": "claimed complete",
            "declarations": [{"name": "alpha", "line": 1, "quote": "def alpha(): return 1"}],
        }
        job = {
            "id": "R01", "kind": "review", "lane": "core",
            "source_path": str(source.resolve()), "source_sha256": source_hash,
            "expected_declarations": ["alpha", "beta"],
            "review_seconds": 0, "emulator_seconds": 0,
        }
        digest = dispatcher.input_digest(job, extraction)
        packet = {
            "job_id": "R01", "worker": "W2", "attempt_id": "R01.a1",
            "input_digest": digest, "job": job,
            "extraction_receipt": extraction,
        }
        forged = worker.execute(packet)["receipt"]
        self.assertEqual(forged["decision"], "amend")
        forged["decision"] = "accepted"
        forged["discrepancies"] = []
        forged["summary"] = "forged acceptance"
        attempt = {
            "worker": "W2", "attempt_id": "R01.a1",
            "input_digest": digest, "packet": packet,
        }

        with self.assertRaisesRegex(ValueError, "independently verified evidence"):
            dispatcher._validate_receipt(
                forged,
                {"id": "R01", "kind": "review", "source_path": str(source.resolve()), "source_sha256": source_hash},
                attempt,
            )


if __name__ == "__main__":
    unittest.main()
