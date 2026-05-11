# Next.js client dashboard (`web/`)

Implements GitHub Issues [#13](https://github.com/StanfordCS194/spr26-Team-6/issues/13), [#14](https://github.com/StanfordCS194/spr26-Team-6/issues/14), and [#15](https://github.com/StanfordCS194/spr26-Team-6/issues/15): filter sidebar and RFP feed, detail pane with markdown stub + AI tab, and profile drawer with saved RFPs.

Full as-built architecture, API stubs, and file map: **[Frontend Implementation Plan](https://github.com/StanfordCS194/spr26-Team-6/wiki/Frontend-Implementation-Plan)** (wiki).

## Commands

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production check
npm run start   # after build
```

## Data

The dashboard loads from **Supabase** after email + password auth: `rfps` (active + relevant), `scores`, `saved_rfps`, `contractors`, and `contractor_past_projects`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (see `.env.example`). Optional mock fixtures remain in `lib/mockData.ts` for local experiments only.

## Analytics and midpoint A/B

- **PostHog (two ways):**
  - **Local / build-inlined:** `NEXT_PUBLIC_POSTHOG_KEY` (+ optional `NEXT_PUBLIC_POSTHOG_HOST` for EU).
  - **Vercel Preview (runtime):** set **`POSTHOG_PROJECT_API_KEY`** to the same PostHog project token (server-only name). The app calls **`GET /api/posthog-config`** on load and initializes the browser SDK so Preview env changes apply without relying on build-time inlining. You can still set `NEXT_PUBLIC_POSTHOG_KEY` instead if you redeploy after every key change.
- **Vercel:** If analytics is missing on preview, add **`POSTHOG_PROJECT_API_KEY`** for **Preview**, redeploy, then open DevTools → Network and confirm `/api/posthog-config` returns `"apiKey":"phc_..."` (not `null`).
- **List card layout:** `NEXT_PUBLIC_LIST_CARD_LAYOUT` is `headline_first` (default) or `score_first`. Use two Vercel preview environments with different values so testers see variant A vs B without maintaining two branches.
