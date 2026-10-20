import json
import os
import tempfile
import unittest
from unittest import mock
from pathlib import Path

from experiments.rebalancer import benchmark


ROOT = Path(__file__).resolve().parents[1]
RECIPE = ROOT / "recipes" / "execution.example.json"


class BenchmarkTests(unittest.TestCase):
    def test_recipe_has_six_lane_bounded_workers_and_eight_hash_pinned_jobs(self):
        spec = json.loads(RECIPE.read_text())
        self.assertEqual(len(spec["workers"]), 6)
        self.assertEqual(len(spec["jobs"]), 8)
        self.assertEqual(set(spec["execution"]["worker_lanes"]), set(spec["workers"]))
        self.assertEqual(set(spec["execution"]["fixed_roles"].values()), {"extract", "review"})
        self.assertEqual(sum(role == "extract" for role in spec["execution"]["fixed_roles"].values()), 3)
        for job in spec["jobs"]:
            self.assertRegex(job["source_sha256"], r"^[0-9a-f]{64}$")
            self.assertTrue(job["expected_declarations"])

    def test_source_paths_resolve_from_recipe_location_not_current_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            shadow = Path(tmp) / "adversarial" / "probe_a03.py"
            shadow.parent.mkdir()
            shadow.write_text("def wrong_source(): pass\n")
            old_cwd = Path.cwd()
            try:
                os.chdir(tmp)
                resolved = benchmark._resolve_source_paths(json.loads(RECIPE.read_text()), RECIPE)
            finally:
                os.chdir(old_cwd)
        expected = ROOT / "adversarial" / "probe_a03.py"
        for job in resolved["jobs"]:
            self.assertEqual(Path(job["source_path"]), expected.resolve())
            self.assertTrue(Path(job["source_path"]).is_file())

    def test_delay_control_zeros_both_service_delays_without_mutating_recipe(self):
        source = json.loads(RECIPE.read_text())
        clone = benchmark._delay_spec(source, no_delay=True)
        self.assertTrue(all(job["emulator_seconds"] == job["review_seconds"] == 0 for job in clone["jobs"]))
        self.assertGreater(source["jobs"][0]["emulator_seconds"], 0)

    def test_tuned_roles_are_static_one_extractor_two_reviewers_per_lane(self):
        spec = json.loads(RECIPE.read_text())
        roles = benchmark.tuned_roles(spec)
        self.assertEqual(sum(role == "extract" for role in roles.values()), 2)
        for lane in {lane for lanes in spec["execution"]["worker_lanes"].values() for lane in lanes}:
            roles_in_lane = [roles[w] for w, lanes in spec["execution"]["worker_lanes"].items() if lane in lanes]
            self.assertEqual(roles_in_lane.count("extract"), 1)
            self.assertEqual(roles_in_lane.count("review"), 2)

    def test_aggregate_and_signed_ratio_report_actual_medians_and_direction(self):
        self.assertEqual(benchmark.aggregate([4, 2, 3]), {"median": 3, "min": 2, "max": 4, "range": 2})
        result = benchmark.comparison_ratio([8, 10], [10, 12])
        self.assertAlmostEqual(result["dynamic_over_fixed"], 9 / 11)
        self.assertAlmostEqual(result["signed_improvement_fraction"], 2 / 11)
        slower = benchmark.comparison_ratio([12], [10])
        self.assertGreater(slower["signed_improvement_fraction"], -1)
        self.assertLess(slower["signed_improvement_fraction"], 0)

    def test_metrics_require_final_done_and_latest_reviews_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            state = {
                "schema": "chainspot.dispatcher-state/v1",
                "final_reviews": {"E1": "R1.fix1"},
                "jobs": {
                    "E1": {"id": "E1", "kind": "extract", "status": "done", "final_status": "accepted", "repair_count": 1, "attempts": []},
                    "R1": {"id": "R1", "kind": "review", "status": "done", "attempts": []},
                    "R1.fix1": {"id": "R1.fix1", "kind": "review", "status": "done", "attempts": []},
                },
            }
            (root / "state.json").write_text(json.dumps(state))
            accepted_attempt = {"accepted": True, "receipt_path": str(root / "attempts/R1.fix1/a2/receipt.json"), "attempt_id": "a2"}
            amended_attempt = {"accepted": True, "receipt_path": str(root / "attempts/R1/a1/receipt.json"), "attempt_id": "a1"}
            state["jobs"]["R1"]["attempts"] = [amended_attempt]
            state["jobs"]["R1.fix1"]["attempts"] = [accepted_attempt]
            state["jobs"]["R1"]["receipt_data"] = {"kind": "review", "job_id": "R1", "attempt_id": "a1", "worker": "W1", "decision": "amend", "work_seconds": 0.01}
            state["jobs"]["R1.fix1"]["receipt_data"] = {"decision": "accepted", "kind": "review", "job_id": "R1.fix1", "attempt_id": "a2", "worker": "W2", "work_seconds": 0.02, "elapsed_seconds": 0.03}
            (root / "state.json").write_text(json.dumps(state))
            (root / "attempts/R1/a1").mkdir(parents=True)
            (root / "attempts/R1.fix1/a2").mkdir(parents=True)
            (root / "attempts/R1/a1/receipt.json").write_text(json.dumps({"kind": "review", "job_id": "R1", "attempt_id": "a1", "decision": "amend", "work_seconds": 0.01}))
            (root / "attempts/R1.fix1/a2/receipt.json").write_text(json.dumps({"kind": "review", "job_id": "R1.fix1", "worker": "W2", "attempt_id": "a2", "decision": "accepted", "work_seconds": 0.02, "elapsed_seconds": 0.03}))
            event_rows = [
                json.dumps({"type": "native_solve", "native_seconds": 0.03}),
                json.dumps({"type": "dispatch_requested", "worker": "W2", "attempt_id": "a2", "monotonic": 10.0}),
                json.dumps({"type": "worker_submitted", "worker": "W2", "attempt_id": "a2", "dispatch_seconds": 0.04}),
                json.dumps({"type": "dispatch_batch_complete", "dispatch_seconds": 0.05}),
                json.dumps({"type": "receipt_arrived", "attempt_id": "a2", "receipt_arrived_monotonic": 10.2}),
            ]
            state["events"] = [json.loads(row) for row in event_rows]
            (root / "state.json").write_text(json.dumps(state))
            (root / "events.jsonl").write_text("\n".join(event_rows) + "\n")
            with mock.patch("experiments.rebalancer.dispatcher.read_committed_state", return_value=state, create=True):
                metrics = benchmark.collect_run_metrics(root, {"status": "complete"}, 1.0)
            self.assertTrue(metrics["all_final_jobs_done"])
            self.assertTrue(metrics["all_final_reviews_accepted"])
            self.assertEqual(metrics["accepted_reviews"], 1)
            self.assertEqual(metrics["amend_reviews"], 1)
            self.assertEqual(metrics["review_receipts"], 2)
            self.assertEqual(metrics["repair_count"], 1)
            self.assertAlmostEqual(metrics["solver_seconds"], 0.03)
            self.assertAlmostEqual(metrics["dispatch_seconds"], 0.05)
            self.assertEqual(metrics["worker_stats"]["W2"]["packet_count"], 1)
            self.assertAlmostEqual(metrics["worker_stats"]["W2"]["dispatch_seconds"], 0.04)
            self.assertAlmostEqual(metrics["worker_stats"]["W2"]["turnaround_seconds"], 0.2)
            self.assertAlmostEqual(metrics["worker_stats"]["W2"]["worker_elapsed_seconds"], 0.03)

    def test_metrics_use_committed_snapshot_when_mutable_aliases_are_rolled_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            committed = {
                "schema": "chainspot.dispatcher-state/v1",
                "events": [
                    {"type": "native_solve", "native_seconds": 0.31},
                    {"type": "dispatch_requested", "worker": "W2", "attempt_id": "a2", "monotonic": 10.0},
                    {"type": "dispatch_batch_complete", "dispatch_seconds": 0.07},
                    {"type": "receipt_arrived", "attempt_id": "a2", "receipt_arrived_monotonic": 10.2},
                ],
                "final_reviews": {"E1": "R1.fix1"},
                "jobs": {
                    "E1": {
                        "id": "E1", "kind": "extract", "status": "done", "final_status": "accepted", "repair_count": 1,
                        "attempts": [], "receipt_data": {"kind": "extract", "job_id": "E1", "attempt_id": "e1", "worker": "W1", "work_seconds": 0.01, "elapsed_seconds": 0.01},
                    },
                    "R1": {
                        "id": "R1", "kind": "review", "status": "done",
                        "attempts": [{"accepted": True, "attempt_id": "a1"}],
                        "receipt_data": {"kind": "review", "job_id": "R1", "attempt_id": "a1", "worker": "W3", "decision": "amend", "work_seconds": 0.02},
                    },
                    "R1.fix1": {
                        "id": "R1.fix1", "kind": "review", "status": "done",
                        "attempts": [{"accepted": True, "attempt_id": "a2"}],
                        "receipt_data": {"kind": "review", "job_id": "R1.fix1", "attempt_id": "a2", "worker": "W2", "decision": "accepted", "work_seconds": 0.03, "elapsed_seconds": 0.03},
                    },
                },
            }
            # Simulate rsync-style replacement of the mutable compatibility aliases.
            (root / "state.json").write_text(json.dumps({"jobs": {}, "events": []}))
            (root / "events.jsonl").write_text(json.dumps({"type": "native_solve", "native_seconds": 99.0}) + "\n")
            with mock.patch("experiments.rebalancer.dispatcher.read_committed_state", return_value=committed, create=True):
                metrics = benchmark.collect_run_metrics(root, {"status": "complete"}, 1.0)
            self.assertTrue(metrics["all_final_jobs_done"])
            self.assertTrue(metrics["all_final_reviews_accepted"])
            self.assertEqual(metrics["review_receipts"], 2)
            self.assertEqual(metrics["final_review_receipts"], 1)
            self.assertAlmostEqual(metrics["solver_seconds"], 0.31)
            self.assertAlmostEqual(metrics["dispatch_seconds"], 0.07)
            self.assertFalse(metrics["mutable_snapshot_matches_committed"])
            self.assertFalse(metrics["mutable_state_matches_committed"])
            self.assertFalse(metrics["mutable_events_match_committed"])

    def test_metrics_do_not_suppress_invalid_committed_snapshot_errors(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with mock.patch(
                "experiments.rebalancer.dispatcher.read_committed_state",
                side_effect=ValueError("completion receipt hash mismatch"),
                create=True,
            ) as read_committed:
                with self.assertRaisesRegex(ValueError, "completion receipt hash mismatch"):
                    benchmark.collect_run_metrics(root, {"status": "complete"}, 1.0)
            read_committed.assert_called_once_with(root)

    def test_run_single_retries_only_native_score_mismatch_and_counts_failed_time(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_dir = root / "run"
            spec = {"workers": [], "jobs": [], "execution": {}}
            metrics = {
                "all_final_jobs_done": True,
                "all_final_reviews_accepted": True,
                "wall_seconds": 0.0,
            }
            complete = {"status": "complete", "run_dir": str(run_dir)}
            ticks = iter((0.0, 0.0, 1.25, 1.25, 3.25, 3.25))
            with mock.patch("experiments.rebalancer.dispatcher.initialize") as initialize, \
                 mock.patch("experiments.rebalancer.dispatcher.run", side_effect=[
                     RuntimeError("native assignment rejected before dispatch: ['nonoptimal_native_score']"),
                     complete,
                 ]) as run, \
                 mock.patch.object(benchmark, "collect_run_metrics", return_value=metrics) as collect, \
                 mock.patch.object(benchmark.time, "perf_counter", side_effect=lambda: next(ticks)):
                result = benchmark._run_single(spec, "dynamic", run_dir, 30)
            self.assertEqual(initialize.call_count, 1)
            self.assertEqual(run.call_count, 2)
            self.assertEqual(collect.call_args.args[2], 3.25)
            self.assertEqual(result["native_score_failure_count"], 1)
            self.assertEqual(result["session_results"][0]["elapsed_seconds"], 1.25)
            self.assertEqual(result["session_results"][1]["elapsed_seconds"], 2.0)
            failure_files = list((run_dir / "session-failures").glob("*.json"))
            self.assertEqual(len(failure_files), 1)
            failure = json.loads(failure_files[0].read_text())
            self.assertEqual(failure["reason"], ["nonoptimal_native_score"])
            self.assertEqual(failure["elapsed_seconds"], 1.25)

    def test_run_single_does_not_retry_unrelated_runtime_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp) / "run"
            with mock.patch("experiments.rebalancer.dispatcher.initialize"), \
                 mock.patch("experiments.rebalancer.dispatcher.run", side_effect=RuntimeError("native assignment rejected before dispatch: ['capacity_exceeded']")) as run:
                with self.assertRaisesRegex(RuntimeError, "capacity_exceeded"):
                    benchmark._run_single({"workers": [], "jobs": [], "execution": {}}, "dynamic", run_dir, 30)
            self.assertEqual(run.call_count, 1)
            self.assertFalse((run_dir / "session-failures").exists())

    def test_run_single_persists_all_failures_before_exhausting_retry_cap(self):
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp) / "run"
            error = RuntimeError("native assignment rejected before dispatch: ['nonoptimal_native_score']")
            with mock.patch("experiments.rebalancer.dispatcher.initialize"), \
                 mock.patch("experiments.rebalancer.dispatcher.run", side_effect=error) as run:
                with self.assertRaisesRegex(RuntimeError, "retry cap"):
                    benchmark._run_single({"workers": [], "jobs": [], "execution": {}}, "dynamic", run_dir, 30)
            self.assertEqual(run.call_count, benchmark.MAX_NATIVE_SCORE_SESSIONS)
            files = sorted((run_dir / "session-failures").glob("*.json"))
            self.assertEqual(len(files), benchmark.MAX_NATIVE_SCORE_SESSIONS)
            failure_run = json.loads((run_dir / "benchmark-run.json").read_text())
            self.assertEqual(failure_run["status"], "native_score_retry_exhausted")
            self.assertEqual(failure_run["native_score_failure_count"], benchmark.MAX_NATIVE_SCORE_SESSIONS)
            self.assertEqual(len(failure_run["session_results"]), benchmark.MAX_NATIVE_SCORE_SESSIONS)

    def test_comparison_summarizes_native_score_failures_and_session_bounds(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "comparison"
            metric_names = ("wall_seconds", "solver_seconds", "dispatch_seconds", "worker_work_seconds", "simulated_service_seconds")

            def fake_run(spec, policy, run_dir, max_seconds):
                return {
                    "policy": policy,
                    "metrics": {
                        **{name: 1.0 for name in metric_names},
                        "all_final_jobs_done": True,
                        "all_final_reviews_accepted": True,
                        "mutable_snapshot_matches_committed": True,
                    },
                    "native_score_failure_count": {"dynamic": 1, "fixed": 0, "fixed_tuned": 2}[policy],
                }

            with mock.patch.object(benchmark, "_run_single", side_effect=fake_run):
                result = benchmark.run_benchmark(RECIPE, output, repetitions=1, max_seconds=7.5)
            for scenario in ("delayed", "no_delay"):
                self.assertEqual(result["summary"][scenario]["dynamic"]["native_score_failure_count"], 1)
                self.assertEqual(result["summary"][scenario]["fixed"]["native_score_failure_count"], 0)
                self.assertEqual(result["summary"][scenario]["fixed_tuned"]["native_score_failure_count"], 2)
            self.assertEqual(result["max_seconds_per_session"], 7.5)
            self.assertEqual(result["max_sessions_per_run"], benchmark.MAX_NATIVE_SCORE_SESSIONS)
            self.assertNotIn("max_seconds_per_run", result)
            report = (output / "report.md").read_text()
            self.assertIn("Only the exact native `nonoptimal_native_score` rejection is retried", report)
            self.assertIn("Native score failures", report)

    def test_report_skips_comparison_ratio_rows_and_shows_all_three_policies(self):
        metric_names = ("wall_seconds", "solver_seconds", "dispatch_seconds", "worker_work_seconds", "simulated_service_seconds")
        policies = {}
        for policy in benchmark.POLICIES:
            policies[policy] = {"metrics": {name: benchmark.aggregate([1.0, 2.0]) for name in metric_names}}
        policies["dynamic_vs_fixed_wall"] = benchmark.comparison_ratio([1.0], [2.0])
        policies["dynamic_vs_tuned_fixed_wall"] = benchmark.comparison_ratio([1.0], [1.5])
        result = {
            "repetitions": 2,
            "no_delay_control": True,
            "max_seconds_per_session": 30,
            "max_sessions_per_run": benchmark.MAX_NATIVE_SCORE_SESSIONS,
            "summary": {"delayed": policies, "no_delay": policies},
        }
        report = benchmark._report_markdown(result)
        self.assertIn("fixed_tuned", report)
        self.assertIn("dynamic/fixed median wall-time ratio", report)


if __name__ == "__main__":
    unittest.main()
