## Learned User Preferences

- Prefer simplified code with unnecessary abstractions and defensive checks removed when the API contract or local workflow already guarantees the shape.
- Keep answers practical and directly tied to what the user can run or inspect next.
- When handling secrets or API keys, avoid echoing values in logs, errors, summaries, or committed files.

## Learned Workspace Facts

- The web app uses Supabase email/password auth; this repo does not define built-in demo credentials, so users sign up with their own account and passwords must be at least 6 characters.
- Dashboard RFP cards are loaded from Supabase, primarily `rfps` rows where `status = "active"` and `is_relevant = true`, then merged with related `scores`, `saved_rfps`, `rfp_summaries`, `contractors`, and `contractor_past_projects` data.
- The authenticated Supabase MCP currently exposes a single `GovBid` project; do not assume separate live `dev` and `production` Supabase projects unless re-verified.
- The public Supabase schema includes `contractors`, `rfps`, `saved_rfps`, `contractor_past_projects`, `rfp_chunks`, `rfp_amendments`, `scores`, `rfp_summaries`, and `department_aliases`, all with RLS enabled.
- SAM.gov scraper runs require `SAM_GOV_API_KEY` in the environment, typically by sourcing `web/.env` before running the Python CLI.
- `scraper/samgov_interface.py` searches SAM.gov with tech NAICS codes `541511`, `541512`, `541513`, `541519`, `518210`, `513210`, and `511210`, and procurement types `o`, `k`, `p`, `r`, and `s`.
- SAM.gov ingestion filters to active opportunities, deduplicates by `noticeId`, downloads every `resourceLinks[]` attachment by default, and stores description cache files under `scraper/cache/samgov/desc/`.
- For Google Drive upload detection, both `drive.google.com` and `docs.google.com` URLs count as successful Drive uploads because uploaded Office files may be converted to native Google Docs links.
