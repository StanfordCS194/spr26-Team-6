# GovBid dashboard design iteration log

Variant A · 1440×900 desktop · 2026-06-04

## Screenshot capture

PNG exports use **exact viewport clips** (not the Cursor Glass panel’s retina/full-page capture):

| File | Viewport |
|------|----------|
| Desktop shots | 1440×900, `deviceScaleFactor: 1` |
| Mobile smoke | 768×1024 |

Captured via CDP `Page.captureScreenshot` with a fixed clip while authenticated in the dev browser.

**Baseline vs final:** `00-baseline-*.png` were captured with design changes **stashed** (pre-iteration UI). `06-final-*.png` were captured after restoring the iteration changes.

## Baseline

| File | State |
|------|--------|
| `00-baseline-empty.png` | No RFP selected |
| `00-baseline-selected.png` | DMSI Architecture selected |

## Iterations

### 1/9 — Surface separation

**Issue:** Sidebar, feed, and detail all read as flat white.

**Change:** Added `--govbid-canvas` token; canvas background on main grid and feed column; elevated detail empty panel; stronger sidebar borders.

**Files:** `globals.css`, `DashboardMainGrid.tsx`, `RfpSidebar.tsx`, `RfpFeed.tsx`, `DetailPanel.tsx`

### 2/9 — Feed column header

**Issue:** List jumped straight into cards with no orienting chrome.

**Change:** Sticky header with title (Opportunities / Saved / History), result count, and “Filters active” pill when filters apply.

**Files:** `RfpFeed.tsx`

### 3/9 — Detail empty state

**Issue:** Plain text placeholder vs polished Variant B.

**Change:** Document icon in primary-muted circle + improved copy layout.

**Files:** `DetailPanel.tsx`

### 4/9 — Split pane affordance

**Issue:** Divider hard to see and grab.

**Change:** Wider divider track (8px), tinted hover band, stronger handle border/shadow.

**Files:** `ResizableSplitPane.tsx`

### 5/9 — Header action hierarchy

**Issue:** Stub “+” competed with primary nav as a filled button.

**Change:** Outlined secondary style for New opportunity.

**Files:** `GlobalHeader.tsx`

### 6/9 — Collapsed filter rail

**Issue:** Collapsed sidebar was a thin strip with little context.

**Change:** Elevated rail, min-width, vertical “Filters” label on desktop.

**Files:** `RfpSidebar.tsx`

### 7/9 — Detail panel header hierarchy

**Issue:** Title and actions were buried below tabs or duplicated in tab content; actions felt disconnected from context.

**Change:** Sticky header block with RFP title + agency; Save / Generate summary / Saved badge inline; horizontally scrollable tab row; removed duplicate title from Overview tab body.

**Files:** `DetailPanel.tsx`

### 8/9 — Feed card density

**Issue:** Cards felt tall with redundant “Due {date}” row when the date column already shows the deadline.

**Change:** Tighter padding and list gap; smaller date column typography; removed redundant due-date row.

**Files:** `RfpCard.tsx`, `RfpFeed.tsx`

### 9/9 — Selected card affordance

**Issue:** Active selection relied on subtle border tint alone.

**Change:** Left purple accent bar, soft ring, and primary-tinted surface on selected cards (both headline-first and score-first layouts).

**Files:** `RfpCard.tsx`

### 10/10 — Overview key-details strip

**Issue:** Location, due date, countdown, and tags felt scattered across the Overview tab with uneven visual weight.

**Change:** Unified “Key details” 3-column grid (location, due date, time remaining); labeled Tags section; compact countdown cell; client-only countdown render to avoid hydration mismatch.

**Files:** `DetailPanel.tsx`

## Final screenshots

| File | State |
|------|--------|
| `06-final-empty.png` | After all iterations, no selection |
| `06-final-selected.png` | After all iterations, RFP selected |
| `06-final-mobile-768.png` | 768px viewport smoke check |

## Verification

- Dashboard loads authenticated with Variant A
- RFP selection populates detail panel
- Filters collapse/expand preserved
- No new linter errors in touched files
