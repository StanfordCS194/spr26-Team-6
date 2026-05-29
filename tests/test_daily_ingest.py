"""Regression tests for scripts/daily_ingest.sh contract."""

import unittest
from pathlib import Path


class DailyIngestScriptTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[1]
        self.script = (root / "scripts" / "daily_ingest.sh").read_text(encoding="utf-8")

    def test_sam_not_run_by_default(self):
        # SAM invoke must live inside the opt-in guard, not on the default path.
        sam_line = 'python run_pipeline.py sam'
        guard_idx = self.script.find('DAILY_INGEST_SAM:-}" == "1"')
        sam_idx = self.script.find(sam_line)
        self.assertNotEqual(sam_idx, -1)
        self.assertNotEqual(guard_idx, -1)
        self.assertGreater(sam_idx, guard_idx, "SAM must only run when DAILY_INGEST_SAM=1")

    def test_sam_opt_in_only(self):
        self.assertIn("DAILY_INGEST_SAM", self.script)
        self.assertIn('DAILY_INGEST_SAM:-}" == "1"', self.script)

    def test_eprocure_always_runs(self):
        self.assertIn("python run_pipeline.py eProcure", self.script)

    def test_public_purchase_opt_in_only(self):
        pp_line = "python run_pipeline.py publicPurchase"
        guard_idx = self.script.find('DAILY_INGEST_PUBLIC_PURCHASE:-}" == "1"')
        pp_idx = self.script.find(pp_line)
        self.assertNotEqual(pp_idx, -1)
        self.assertNotEqual(guard_idx, -1)
        self.assertGreater(pp_idx, guard_idx, "Public Purchase must only run when opt-in")


if __name__ == "__main__":
    unittest.main()
