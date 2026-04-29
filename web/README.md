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
