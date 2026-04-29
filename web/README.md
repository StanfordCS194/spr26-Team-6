# BAGEA client dashboard (Next.js)

Implements GitHub Issues [#13](https://github.com/StanfordCS194/spr26-Team-6/issues/13), [#14](https://github.com/StanfordCS194/spr26-Team-6/issues/14), and [#15](https://github.com/StanfordCS194/spr26-Team-6/issues/15): sidebar RFP discovery, detail pane with markdown stub + AI tab, and profile drawer with saved RFPs.

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

Mock RFPs live in `lib/mockData.ts`. Profile fields and saved RFP IDs persist to `localStorage` under the key `bagea-dashboard-v1`.