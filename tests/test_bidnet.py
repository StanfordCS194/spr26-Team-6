"""
Offline tests for the BidNet Direct scraper's pure logic: external-id parsing,
Eastern-stamped date parsing, payload schema, and tech/IT/telecom relevance.
The Playwright login/search/detail flow needs a live logged-in session and is not
covered here.

Run with: python -m unittest tests.test_bidnet
"""

import unittest

from scraper import bidnet_json_generator as g
from scraper.bidnet_interface import BidNetInterface, DetailRecord


class ExternalIdTests(unittest.TestCase):
    def test_numeric_id_from_abstract_url(self):
        url = (
            "/public/supplier/solicitations/statewide/444042433665/abstract"
            "?purchasingGroupId=88020151&origin=1"
        )
        self.assertEqual(g.external_id_from_detail_url(url), "444042433665")

    def test_unknown_when_empty(self):
        self.assertEqual(g.external_id_from_detail_url(""), "unknown")


class DateParsingTests(unittest.TestCase):
    def test_eastern_datetime(self):
        self.assertEqual(
            g.parse_bidnet_datetime("05/29/2026 03:02 PM EDT"),
            "2026-05-29T15:02:00-04:00",
        )

    def test_date_only(self):
        self.assertEqual(
            g.parse_bidnet_datetime("09/01/2026"),
            "2026-09-01T00:00:00-04:00",
        )

    def test_garbage_returns_none(self):
        self.assertIsNone(g.parse_bidnet_datetime("not a date"))
        self.assertIsNone(g.parse_bidnet_datetime(None))


class PayloadTests(unittest.TestCase):
    def test_schema_and_locked_handling(self):
        fields = {
            "title": "IT Network Modernization",
            "issuing_organization": "City of Example",
            "solicitation_number": "RFP-2026-001",
            "description": "Software and network upgrade.",
            "publication_date": "05/29/2026 03:02 PM EDT",
            "closing_date": "09/01/2026 08:00 PM EDT",
            "location": "California",
            "source": "Locked",  # placeholder -> should become None
        }
        payload = g.build_payload(
            fields,
            "/public/supplier/solicitations/statewide/444042433665/abstract",
            [{"label": "RFP.pdf", "url": "https://x/y.pdf", "type": "primary_spec"}],
            [{"code": "920-00", "description": "Data Processing & Software Services"}],
        )
        self.assertEqual(payload["source"], "BidNet Direct")
        self.assertEqual(payload["external_id"], "444042433665")
        self.assertEqual(payload["dept"], "City of Example")
        self.assertEqual(payload["due_date"], "2026-09-01T20:00:00-04:00")
        self.assertTrue(payload["content_hash"].startswith("v1-444042433665-"))
        self.assertIsNone(payload["metadata"]["issuing_source"])  # "Locked" -> None
        self.assertEqual(len(payload["metadata"]["documents"]), 1)
        # Same field surface as the other sources.
        for key in (
            "source", "external_id", "title", "dept", "description",
            "published_date", "due_date", "contact_name", "contact_email",
            "contact_phone", "status", "is_relevant", "content_hash", "metadata",
        ):
            self.assertIn(key, payload)


class RelevanceTests(unittest.TestCase):
    def test_tech_code_prefix_matches(self):
        rec = DetailRecord(
            fields={"title": "x", "description": "y"},
            category_codes=[{"code": "920-05", "description": "programming services"}],
        )
        self.assertTrue(BidNetInterface.is_tech_relevant(rec))

    def test_keyword_fallback_when_no_codes(self):
        rec = DetailRecord(
            fields={"title": "Cloud migration project", "description": ""},
            category_codes=[],
        )
        self.assertTrue(BidNetInterface.is_tech_relevant(rec))

    def test_non_tech_rejected(self):
        rec = DetailRecord(
            fields={"title": "Janitorial Services", "description": "mopping floors"},
            category_codes=[{"code": "910-00", "description": "custodial services"}],
        )
        self.assertFalse(BidNetInterface.is_tech_relevant(rec))

    def test_non_tech_codes_override_text_keywords(self):
        # Real false positive: behavioral-health bid tagged with non-tech NIGP codes
        # but whose description mentions a "provider network" must NOT be kept.
        rec = DetailRecord(
            fields={
                "title": "Behavioral Health Housing Interventions",
                "description": "Build a provider network for emergency shelter.",
            },
            category_codes=[
                {"code": "918", "description": "Consulting Services"},
                {"code": "952", "description": "Human Services"},
            ],
        )
        self.assertFalse(BidNetInterface.is_tech_relevant(rec))


if __name__ == "__main__":
    unittest.main()
