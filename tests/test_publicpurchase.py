"""Unit tests for Public Purchase parsing and JSON generation."""

import unittest
from pathlib import Path

from scraper import publicpurchase_json_generator as json_generator
from scraper.publicpurchase_agencies import bid_detail_url
from scraper.publicpurchase_json_generator import external_id_from_parts
from scraper.publicpurchase_interface import (
    extract_bid_id_from_url,
    is_login_required_html,
    matches_tech_keywords,
    parse_bid_detail_html,
    parse_open_bids_html,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "publicpurchase"


class PublicPurchaseParserTests(unittest.TestCase):
    def setUp(self):
        self.open_bids_html = (FIXTURES / "open_bids_table.html").read_text(encoding="utf-8")
        self.detail_html = (FIXTURES / "bid_detail.html").read_text(encoding="utf-8")

    def test_parse_open_bids_table(self):
        rows = parse_open_bids_html(self.open_bids_html, "manteca,ca")
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].bid_id, "90210")
        self.assertIn("Cybersecurity", rows[0].title)
        self.assertEqual(
            rows[0].detail_url,
            bid_detail_url("manteca,ca", "90210"),
        )

    def test_extract_bid_id_from_url(self):
        url = "https://www.publicpurchase.com/gems/manteca,ca/bid/public/view?bidId=90210"
        self.assertEqual(extract_bid_id_from_url(url), "90210")

    def test_login_required_detector(self):
        html = "<tr><td>Please log in to view the open bids for this agency</td></tr>"
        self.assertTrue(is_login_required_html(html))

    def test_keyword_filter(self):
        self.assertTrue(
            matches_tech_keywords(
                "IT Network Equipment and Cybersecurity Software RFP",
                ["software", "cybersecurity"],
            )
        )
        self.assertFalse(
            matches_tech_keywords("Parking Lot Resurfacing Project", ["software"])
        )

    def test_parse_bid_detail_html(self):
        text, docs = parse_bid_detail_html(self.detail_html)
        self.assertIn("541512", text)
        self.assertIn("procurement@manteca.gov", text)
        self.assertEqual(len(docs), 2)
        self.assertTrue(all(url.endswith(".pdf") or "download" in url for url, _ in docs))


class PublicPurchaseJsonGeneratorTests(unittest.TestCase):
    def test_build_payload_shape(self):
        detail_html = (FIXTURES / "bid_detail.html").read_text(encoding="utf-8")
        text, _docs = parse_bid_detail_html(detail_html)
        payload = json_generator.build_payload(
            text,
            agency_slug="manteca,ca",
            bid_id="90210",
            detail_url=bid_detail_url("manteca,ca", "90210"),
            documents=[
                {
                    "label": "RFP_90210.pdf",
                    "url": "https://drive.google.com/file/d/abc/view",
                    "type": "primary_spec",
                    "attachment_description": "",
                }
            ],
            agency_name="City of Manteca",
            listing_title="IT Network Equipment and Cybersecurity Software RFP",
        )
        self.assertEqual(payload["source"], "Public Purchase")
        self.assertEqual(payload["external_id"], external_id_from_parts("manteca,ca", "90210"))
        self.assertIn("541512", payload["metadata"]["naics_codes"])
        self.assertEqual(len(payload["metadata"]["documents"]), 1)


if __name__ == "__main__":
    unittest.main()
