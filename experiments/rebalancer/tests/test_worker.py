import hashlib
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path

from experiments.rebalancer import worker


def packet(source: Path, kind: str = "extract", **job_overrides):
    raw = source.read_bytes()
    declarations = ["alpha", "beta", "alpha"]
    job = {
        "source_path": str(source.resolve()),
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "kind": kind,
        "expected_declarations": declarations,
        "emulator_seconds": 0,
        "review_seconds": 0,
    }
    job.update(job_overrides)
    return {
        "job_id": "E01" if kind == "extract" else "R01",
        "worker": "W1" if kind == "extract" else "W2",
        "attempt_id": "a1",
        "input_digest": "d" * 64,
        "job": job,
    }


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "sample.py"
        self.path.write_text(
            "def alpha(x):\n    return x + 1\n\n"
            "async def beta(y):\n    return y\n\n"
            "def alpha(z):\n    return z * 2\n",
            encoding="utf-8",
        )

    def test_extract_reads_source_and_preserves_duplicate_declarations_and_exact_quotes(self):
        result = worker.execute(packet(self.path))
        receipt = result["receipt"]
        self.assertEqual(receipt["outcome"], "extracted")
        self.assertEqual([row["name"] for row in receipt["declarations"]], ["alpha", "beta", "alpha"])
        self.assertEqual(receipt["declarations"][0]["quote"], "def alpha(x):\n    return x + 1")
        self.assertEqual(receipt["declarations"][1]["line"], 4)
        self.assertEqual(receipt["source_sha256"], hashlib.sha256(self.path.read_bytes()).hexdigest())
        self.assertEqual(receipt["job_id"], "E01")
        self.assertGreaterEqual(receipt["work_seconds"], 0)
        self.assertEqual(receipt["simulated_service_seconds"], 0)

    def test_fault_injection_omits_one_expected_declaration_and_reviewer_detects_it(self):
        extraction = worker.execute(packet(self.path, inject_fault=True))["receipt"]
        self.assertEqual(len(extraction["declarations"]), 2)
        review_packet = packet(self.path, "review")
        review_packet["job"]["extraction_receipt"] = extraction
        result = worker.execute(review_packet)["receipt"]
        self.assertEqual(result["decision"], "amend")
        self.assertIn("declaration_set_mismatch", {d["code"] for d in result["discrepancies"]})
        self.assertEqual(result["extraction_receipt_sha256"], worker.receipt_digest(extraction))

    def test_review_accepts_complete_receipt_and_binds_its_hash(self):
        extraction = worker.execute(packet(self.path))["receipt"]
        review_packet = packet(self.path, "review")
        review_packet["job"]["extraction_receipt"] = extraction
        result = worker.execute(review_packet)["receipt"]
        self.assertEqual(result["decision"], "accepted")
        self.assertEqual(result["discrepancies"], [])
        self.assertEqual(result["extraction_receipt_sha256"], worker.receipt_digest(extraction))

    def test_review_catches_forged_quote_and_wrong_source_hash(self):
        extraction = worker.execute(packet(self.path))["receipt"]
        extraction["declarations"][0]["quote"] = "def alpha(forged): ..."
        review_packet = packet(self.path, "review")
        review_packet["job"]["extraction_receipt"] = extraction
        result = worker.execute(review_packet)["receipt"]
        self.assertEqual(result["decision"], "amend")
        self.assertIn("quote_mismatch", {d["code"] for d in result["discrepancies"]})

        review_packet = packet(self.path, "review", source_sha256="0" * 64)
        review_packet["job"]["extraction_receipt"] = worker.execute(packet(self.path))["receipt"]
        result = worker.execute(review_packet)["receipt"]
        self.assertEqual(result["decision"], "amend")
        self.assertIn("packet_source_hash_mismatch", {d["code"] for d in result["discrepancies"]})

    def test_reviewer_must_be_independent(self):
        extraction = worker.execute(packet(self.path))["receipt"]
        review_packet = packet(self.path, "review")
        review_packet["worker"] = extraction["worker"]
        review_packet["job"]["extraction_receipt"] = extraction
        with self.assertRaisesRegex(ValueError, "independent worker"):
            worker.execute(review_packet)

    def test_review_marks_malformed_declaration_rows_for_amendment(self):
        extraction = worker.execute(packet(self.path))["receipt"]
        extraction["declarations"][0]["line"] = True
        review_packet = packet(self.path, "review")
        review_packet["job"]["extraction_receipt"] = extraction
        receipt = worker.execute(review_packet)["receipt"]
        codes = {row["code"] for row in receipt["discrepancies"]}
        self.assertEqual(receipt["decision"], "amend")
        self.assertIn("malformed_declaration", codes)
        self.assertIn("quote_mismatch", codes)

    def test_source_change_and_malformed_packets_are_rejected(self):
        p = packet(self.path)
        self.path.write_text("def changed():\n    pass\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "source SHA-256"):
            worker.execute(p)
        for malformed in ({}, {"job_id": "E01"}, packet(self.path) | {"attempt_id": "../bad"}):
            with self.subTest(malformed=malformed):
                with self.assertRaises(ValueError):
                    worker.execute(malformed)

    def test_simulated_latency_is_reported_separately_from_measured_work(self):
        result = worker.execute(packet(self.path, emulator_seconds=0.02))["receipt"]
        self.assertEqual(result["simulated_service_seconds"], 0.02)
        self.assertGreaterEqual(result["work_seconds"], 0)
        self.assertGreaterEqual(result["elapsed_seconds"], 0.015)
        self.assertLess(result["work_seconds"], result["elapsed_seconds"])

    def test_review_evidence_validator_rejects_forged_acceptance(self):
        extraction = worker.execute(packet(self.path, inject_fault=True))["receipt"]
        review_packet = packet(self.path, "review")
        review_packet["job"]["extraction_receipt"] = extraction
        accepted = worker.execute(review_packet)["receipt"]
        accepted["decision"] = "accepted"
        accepted["discrepancies"] = []
        with self.assertRaisesRegex(ValueError, "does not match"):
            worker.validate_review_evidence(review_packet, accepted)

    def test_non_finite_delays_are_rejected(self):
        for duration in (float("nan"), float("inf")):
            with self.subTest(duration=duration):
                with self.assertRaisesRegex(ValueError, "non-negative number"):
                    worker.execute(packet(self.path, emulator_seconds=duration))

    def test_coordinator_cancellation_interrupts_simulated_wait(self):
        cancel = threading.Event()
        p = packet(self.path, emulator_seconds=0.5)
        p["cancel_event"] = cancel
        timer = threading.Timer(0.02, cancel.set)
        started = time.perf_counter()
        timer.start()
        with self.assertRaisesRegex(RuntimeError, "cancelled by coordinator"):
            worker.execute(p)
        timer.join()
        self.assertLess(time.perf_counter() - started, 0.3)


if __name__ == "__main__":
    unittest.main()
