import json
import tempfile
import unittest
from pathlib import Path

from experiments.rebalancer import probe

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "recipes" / "spec.example.json"


class ProbeTests(unittest.TestCase):
    def test_init_writes_portable_state_from_explicit_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            state_path = output / "run" / "state.json"
            result = probe.init(SPEC, state_path)
            state = json.loads(state_path.read_text())
            self.assertEqual(result["workers"], 6)
            self.assertEqual(len(state["jobs"]), 24)
            self.assertEqual(state["jobs"]["R01"]["depends_on"], "E01")
            self.assertEqual(state["workers"]["W1"]["job"], None)
            self.assertNotIn("/workspace/scratch", state_path.read_text())

    def test_init_refuses_overwrite_without_force(self):
        with tempfile.TemporaryDirectory() as tmp:
            state_path = Path(tmp) / "state.json"
            probe.init(SPEC, state_path)
            original = state_path.read_text()
            with self.assertRaises(FileExistsError):
                probe.init(SPEC, state_path)
            self.assertEqual(state_path.read_text(), original)

    def test_spec_rejects_path_like_job_ids(self):
        spec = json.loads(SPEC.read_text())
        spec["jobs"][0]["id"] = "../escape"
        with self.assertRaisesRegex(ValueError, "safe filename token"):
            probe.make_state(spec)

    def test_allow_workers_empty_is_not_treated_as_unrestricted(self):
        spec = json.loads(SPEC.read_text())
        spec["jobs"] = [spec["jobs"][0] | {"allow_workers": []}]
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            state_path = output / "state.json"
            probe.init(SPEC, state_path)
            state = probe.make_state(spec)
            probe.write_json(state_path, state)
            report = probe.solve(state_path, output / "solves")
            self.assertEqual(report["eligible"]["E01"], [])
            self.assertNotIn("E01", report["dispatch"].values())

    def test_start_rechecks_allow_workers_even_if_latest_event_is_edited(self):
        spec = json.loads(SPEC.read_text())
        spec["jobs"] = [spec["jobs"][0] | {"allow_workers": ["W2"]}]
        state = probe.make_state(spec)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "state.json"
            probe.write_json(path, state)
            report = probe.solve(path, Path(tmp) / "solves")
            self.assertNotIn("W1", report["eligible"]["E01"])
            state = probe.load_state(path)
            state["events"][-1]["dispatch"] = {"W1": "E01"}
            probe.write_json(path, state)
            with self.assertRaisesRegex(ValueError, "allow_workers eligibility"):
                probe.start(path, "W1", "E01", "forged-event")

    def test_native_solve_checks_score_and_writes_only_to_requested_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            state_path = output / "external-state.json"
            run_dir = output / "external-solves"
            probe.init(SPEC, state_path)
            report = probe.solve(state_path, run_dir)
            self.assertTrue(report["independent_capacity_check"])
            self.assertTrue(report["independent_eligibility_check"])
            self.assertEqual(report["native_score"], report["exact_score"])
            self.assertTrue((run_dir / "epoch-00.json").is_file())
            self.assertTrue((run_dir / "epoch-00.bundle").is_file())
            self.assertEqual(json.loads(state_path.read_text())["epoch"], 1)

    def test_start_and_finish_require_recommended_receipt_and_other_reviewer(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            state_path = output / "state.json"
            run_dir = output / "solves"
            receipts = output / "receipts"
            receipts.mkdir()
            probe.init(SPEC, state_path)
            first_solve = probe.solve(state_path, run_dir)
            worker, job = next(iter(first_solve["dispatch"].items()))
            probe.start(state_path, worker, job, "manual-handler")
            pinned_solve = probe.solve(state_path, run_dir)
            self.assertIn(worker, pinned_solve["pinned_workers"])
            self.assertEqual(pinned_solve["assignments"][worker], job)
            with self.assertRaises(ValueError):
                probe.start(state_path, worker, "E02", "wrong-task")
            (receipts / f"{job}.json").write_text(json.dumps({
                "job_id": job, "worker": worker, "outcome": "confirmed_reuse", "summary": "test receipt"
            }))
            probe.finish(state_path, receipts, worker)
            state = probe.load_state(state_path)
            extraction_worker = state["jobs"][job]["worker"]
            review_id = "R" + job[1:]
            next_solve = probe.solve(state_path, run_dir)
            assigned = {w: j for w, j in next_solve["dispatch"].items() if j == review_id}
            self.assertTrue(assigned)
            reviewer = next(iter(assigned))
            self.assertNotEqual(reviewer, extraction_worker)
            probe.start(state_path, reviewer, review_id, "independent-reviewer")
            (receipts / f"{review_id}.json").write_text(json.dumps({
                "job_id": review_id, "worker": reviewer, "decision": "accepted", "summary": "reviewed"
            }))
            probe.finish(state_path, receipts, reviewer)
            self.assertEqual(probe.load_state(state_path)["jobs"][review_id]["status"], "done")

    def test_review_owner_cannot_start_own_review_even_if_recommended(self):
        state = probe.make_state(json.loads(SPEC.read_text()))
        state["jobs"]["E01"].update(status="done", worker="W1")
        state["workers"]["W1"].update(job=None, agent=None)
        state["events"].append({"type": "solve", "dispatch": {"W1": "R01"}})
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "state.json"
            probe.write_json(path, state)
            with self.assertRaisesRegex(ValueError, "different worker"):
                probe.start(path, "W1", "R01", "same-author")

    def test_finish_rejects_receipt_for_wrong_worker(self):
        state = probe.make_state(json.loads(SPEC.read_text()))
        state["workers"]["W1"]["job"] = "E01"
        state["jobs"]["E01"].update(status="running", worker="W1")
        state["events"].append({"type": "solve", "dispatch": {"W1": "E01"}})
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "state.json"
            receipts = Path(tmp) / "receipts"
            receipts.mkdir()
            probe.write_json(path, state)
            (receipts / "E01.json").write_text(json.dumps({
                "job_id": "E01", "worker": "W2", "outcome": "confirmed_reuse", "summary": "wrong worker"
            }))
            with self.assertRaisesRegex(ValueError, "do not match"):
                probe.finish(path, receipts, "W1")


if __name__ == "__main__":
    unittest.main()
