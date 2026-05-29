"""Tests for Supabase ingest helpers (PDF catalog gate)."""

import unittest

from processor.ingest_supabase import ingest_records, record_has_pdf_url, to_rfp_row


class RecordHasPdfUrlTests(unittest.TestCase):
    def test_true_when_metadata_documents_have_url(self):
        processed = {
            "source": "Cal eProcure",
            "external_id": "123",
            "metadata": {"documents": [{"url": "https://example.com/rfp.pdf"}]},
        }
        self.assertTrue(record_has_pdf_url(processed))

    def test_false_when_no_documents(self):
        processed = {
            "source": "sam.gov",
            "external_id": "456",
            "metadata": {"documents": []},
        }
        self.assertFalse(record_has_pdf_url(processed))

    def test_false_when_documents_missing_urls(self):
        processed = {
            "source": "sam.gov",
            "external_id": "789",
            "metadata": {"documents": [{"title": "no link"}]},
        }
        self.assertFalse(record_has_pdf_url(processed))


class IngestRecordsPdfGateTests(unittest.TestCase):
    def test_skips_no_pdf_records_by_default(self):
        client = object()
        records = [
            {
                "source": "sam.gov",
                "external_id": "no-pdf",
                "metadata": {},
            }
        ]

        result = ingest_records(client, records)

        self.assertEqual(result.upserted, 0)
        self.assertEqual(result.skipped, 1)
        self.assertEqual(result.failed, 0)

    def test_to_rfp_row_includes_pdf_columns(self):
        row = to_rfp_row(
            {
                "source": "Cal eProcure",
                "external_id": "1",
                "metadata": {"documents": [{"url": "https://example.com/a.pdf"}]},
            }
        )
        self.assertEqual(row["pdf_url_1"], "https://example.com/a.pdf")


if __name__ == "__main__":
    unittest.main()
