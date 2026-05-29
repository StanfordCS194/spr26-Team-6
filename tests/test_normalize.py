import unittest

from processor.normalize import canonicalize_source


class TestCanonicalizeSource(unittest.TestCase):
    def test_cal_eprocure_aliases(self) -> None:
        self.assertEqual(canonicalize_source("Cal eProcure"), "Cal eProcure")
        self.assertEqual(canonicalize_source("caleprocure"), "Cal eProcure")

    def test_new_source_literals(self) -> None:
        self.assertEqual(canonicalize_source("Authorium"), "Authorium")
        self.assertEqual(canonicalize_source("public purchase"), "Public Purchase")

    def test_unknown_maps_to_other(self) -> None:
        self.assertEqual(canonicalize_source("Supply.io"), "other")
        self.assertEqual(canonicalize_source(None), "other")


if __name__ == "__main__":
    unittest.main()
