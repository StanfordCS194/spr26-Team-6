"""
This test is intended to verify that the search (fuzzy + unspsc filter) of CaleProcure is workin as expected
Run with: python -m unittest tests.test_caleprocure
"""

import unittest

from scraper.caleprocure_interface import (
    CalEProcureInterface,
    SearchResult,
    UnspscCode,
    extract_unspsc_codes_from_unspsc_table,
    is_tech_unspsc,
    parse_search_results,
)

GRID_HTML_SAMPLE = """
<html>
  <body>
    <table>
      <tbody class="clickable">
        <tr id="trRESP_INQA_HD_VW_GR$0_row1">
          <td data-if-label="tdEventId" id="AUC_ID_COL$0" name="AUC_ID_COL$0">0000039014</td>
          <td data-if-label="tdEventName">COURT INTERPRETER SCHEDULING SOFTWARE RFP Number: LSS-2026-207-RB</td>
        </tr>
        <tr id="trRESP_INQA_HD_VW_GR$0_row2">
          <td data-if-label="tdEventId" id="AUC_ID_COL$1" name="AUC_ID_COL$1">0000039020</td>
          <td data-if-label="tdEventName">HVAC Maintenance Services</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>
"""

# Test double that bypasses network and injects UNSPSC extraction
class _FakeCalEProcureInterface(CalEProcureInterface):
    def __init__(self):
        super().__init__(timeout_seconds=1)
        self._codes_by_url = {}

    def _extract_unspsc_with_strategy(self, detail_url, allow_browser_detail=True):
        return self._codes_by_url.get(detail_url, ([], "text_fallback"))


class _FakeSearchCalEProcureInterface(CalEProcureInterface):
    """Test double for Step 1 path selection (requests vs browser fallback)."""

    def __init__(self, request_html: str, browser_html: str):
        super().__init__(timeout_seconds=1)
        self._request_html = request_html
        self._browser_html = browser_html

    def search_raw_html(self, keyword: str) -> str:
        return self._request_html

    def _search_with_browser_html(self, keyword: str) -> str:
        return self._browser_html

class TestCalEProcureInterface(unittest.TestCase):
    def test_extract_unspsc_from_detail_table_cells(self):
        html = """
        <table id="unspscTable">
          <tr>
            <td data-if-label="unspscClassification">43211501</td>
            <td data-if-label="unspscDescription">Computer servers</td>
          </tr>
        </table>
        """
        codes = extract_unspsc_codes_from_unspsc_table(html)
        self.assertEqual(len(codes), 1)
        self.assertEqual(codes[0].code, "43211501")
        self.assertIn("server", codes[0].description.lower())

    def test_parse_search_results_from_grid(self):
        rows = parse_search_results(GRID_HTML_SAMPLE)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].external_id, "0000039014")
        self.assertIn("SOFTWARE", rows[0].event_name)
        self.assertEqual(
            rows[0].detail_url,
            "https://caleprocure.ca.gov/event/BS3/0000039014",
        )

    def test_unspsc_filter_search_keeps_only_tech_codes(self):
        client = _FakeCalEProcureInterface()
        candidates = [
            SearchResult(
                external_id="0000039014",
                event_name="Software licensing agreement",
                detail_url="https://caleprocure.ca.gov/event/BS3/0000039014",
            ),
            SearchResult(
                external_id="0000039020",
                event_name="Janitorial services",
                detail_url="https://caleprocure.ca.gov/event/BS3/0000039020",
            ),
        ]
        client._codes_by_url = {
            "https://caleprocure.ca.gov/event/BS3/0000039014": (
                [UnspscCode(code="43231512", description="License management software")],
                "api_capture_results",
            ),
            "https://caleprocure.ca.gov/event/BS3/0000039020": (
                [UnspscCode(code="76111500", description="Janitorial services")],
                "text_fallback",
            ),
        }

        filtered = client.unspsc_filter_search(candidates, include_probe_metadata=True)
        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0].result.external_id, "0000039014")
        self.assertEqual(filtered[0].extraction_strategy, "api_capture_results")

    def test_is_tech_unspsc_does_not_false_match_substrings(self):
        # "updated" previously matched "data" substring; this should be false now.
        self.assertFalse(is_tech_unspsc("51000000", "Medication inventory updated weekly"))
        self.assertFalse(is_tech_unspsc("51000000", "Pharmacy services"))

    def test_fuzzy_search_candidates_uses_browser_for_single_keyword(self):
        request_only_one = """
        <html><body>
          <tbody class="clickable">
            <tr>
              <td data-if-label="tdEventId">0000039001</td>
              <td data-if-label="tdEventName">Legacy Licensing</td>
            </tr>
          </tbody>
        </body></html>
        """
        browser_has_two = """
        <html><body>
          <tbody class="clickable">
            <tr>
              <td data-if-label="tdEventId">0000039001</td>
              <td data-if-label="tdEventName">Legacy Licensing</td>
            </tr>
            <tr>
              <td data-if-label="tdEventId">0000039002</td>
              <td data-if-label="tdEventName">Technology Upgrade Program</td>
            </tr>
          </tbody>
        </body></html>
        """
        client = _FakeSearchCalEProcureInterface(
            request_html=request_only_one,
            browser_html=browser_has_two,
        )
        rows = client.fuzzy_search_candidates(
            keywords=["technology"],
            fuzzy_threshold=0.95,
            allow_browser_fallback=True,
        )
        ids = {r.external_id for r in rows}
        self.assertEqual(ids, {"0000039001", "0000039002"})

if __name__ == "__main__":
    unittest.main()