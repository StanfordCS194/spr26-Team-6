<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the GovBid Next.js application. The project already had a solid PostHog foundation (`lib/analytics.ts`, `PostHogProvider`, user identification, and 16 events). This session supplemented those with 7 additional targeted events covering filter interaction, profile drawer toggling, document opening, proposal drafting, sign-out, and step-by-step walkthrough tracking. Environment variables were also updated to ensure both `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` are set correctly in `web/.env.local`.

## All instrumented events

| Event name | Description | File |
|---|---|---|
| `auth_sign_in_success` | Successful email/password sign-in | `web/app/login/page.tsx` |
| `auth_sign_in_fail` | Failed sign-in attempt with error code | `web/app/login/page.tsx` |
| `auth_sign_up_success` | Successful account creation | `web/app/login/page.tsx` |
| `auth_sign_up_fail` | Failed sign-up attempt | `web/app/login/page.tsx` |
| `auth_sign_up_pending_confirm` | Account created, awaiting email confirmation | `web/app/login/page.tsx` |
| `auth_submit_exception` | Unexpected error during auth form submit | `web/app/login/page.tsx` |
| `rfp_selected` | User clicks an RFP card to view details | `web/context/DashboardContext.tsx` |
| `rfp_save_toggled` | User saves or unsaves an RFP (with `now_saved` property) | `web/context/DashboardContext.tsx` |
| `profile_saved` | User saves their contractor profile | `web/context/DashboardContext.tsx` |
| `main_nav_changed` | User switches between Dashboard / Saved / History tabs | `web/context/DashboardContext.tsx` |
| `sign_out_clicked` | User initiates sign-out | `web/context/DashboardContext.tsx` |
| `detail_tab_changed` | User switches between Overview / Source PDF / AI Analysis tabs | `web/components/DetailPanel.tsx` |
| `rag_summary_requested` | User clicks Generate Summary on an RFP | `web/components/DetailPanel.tsx` |
| `rag_summary_cached_hit` | Cached AI summary found and loaded | `web/components/DetailPanel.tsx` |
| `rfp_document_opened` | User opens RFP source document in a new tab | `web/components/DetailPanel.tsx` |
| `draft_proposal_clicked` | User clicks Draft Proposal on an RFP | `web/components/DetailPanel.tsx` |
| `filter_applied` | User applies sidebar filters (tag, date range, price) | `web/components/RfpSidebar.tsx` |
| `filter_cleared` | User clears all sidebar filters | `web/components/RfpSidebar.tsx` |
| `profile_drawer_toggled` | User opens or closes the profile drawer | `web/components/GlobalHeader.tsx` |
| `walkthrough_started` | User starts the onboarding walkthrough | `web/components/Walkthrough/Walkthrough.tsx` |
| `walkthrough_step_advanced` | User advances to the next walkthrough step (with step names) | `web/components/Walkthrough/Walkthrough.tsx` |
| `walkthrough_dismissed` | User exits the walkthrough early | `web/components/Walkthrough/Walkthrough.tsx` |
| `walkthrough_completed` | User completes the full walkthrough | `web/components/Walkthrough/Walkthrough.tsx` |

## Next steps

We've built an **Analytics basics** dashboard and 5 insights to monitor user behavior:

- [Analytics basics dashboard](/dashboard/1570929)
- [User sign-in & sign-up trend](/insights/EiQX8nM2) — daily auth success events over 30 days
- [RFP engagement funnel](/insights/Uf2OPiC6) — conversion from RFP selected → AI summary → saved
- [Filter usage over time](/insights/WSaX8sSG) — how often users apply and clear filters
- [Onboarding walkthrough funnel](/insights/EPh5bamK) — walkthrough start → completion rate
- [Core RFP actions trend](/insights/S6NoILo3) — all key RFP actions on one chart

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-nextjs-pages-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
