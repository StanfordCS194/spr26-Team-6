import type { Rfp } from "@/lib/types";

export type SavedRfpRecord = {
  rfpId: string;
  savedAt: string;
  sortPosition: number | null;
  notes: string;
};

export type SavedRfpSortMode =
  | "dueDateAsc"
  | "dueDateDesc"
  | "savedAtDesc"
  | "savedAtAsc"
  | "titleAsc"
  | "titleDesc"
  | "custom";

const SORT_MODES: SavedRfpSortMode[] = [
  "dueDateAsc",
  "dueDateDesc",
  "savedAtDesc",
  "savedAtAsc",
  "titleAsc",
  "titleDesc",
  "custom",
];

export const SAVED_RFP_SORT_MODES: {
  value: SavedRfpSortMode;
  label: string;
}[] = [
  { value: "dueDateAsc", label: "Due date (soonest)" },
  { value: "dueDateDesc", label: "Due date (latest)" },
  { value: "savedAtDesc", label: "Saved (newest)" },
  { value: "savedAtAsc", label: "Saved (oldest)" },
  { value: "titleAsc", label: "Title (A–Z)" },
  { value: "titleDesc", label: "Title (Z–A)" },
  { value: "custom", label: "Custom order" },
];

export const SAVED_RFP_SORT_STORAGE_KEY = "govbid-profile-saved-sort";

const LEGACY_SORT_MAP: Record<string, SavedRfpSortMode> = {
  date: "dueDateAsc",
  saveTime: "savedAtDesc",
  alphabetical: "titleAsc",
  custom: "custom",
};

export function normalizeSavedRfpSortMode(raw: string | null): SavedRfpSortMode {
  if (raw && raw in LEGACY_SORT_MAP) {
    return LEGACY_SORT_MAP[raw];
  }
  if (raw && SORT_MODES.includes(raw as SavedRfpSortMode)) {
    return raw as SavedRfpSortMode;
  }
  return "savedAtDesc";
}

export function readSavedRfpSortMode(): SavedRfpSortMode {
  if (typeof window === "undefined") return "savedAtDesc";
  try {
    const raw = localStorage.getItem(SAVED_RFP_SORT_STORAGE_KEY);
    return normalizeSavedRfpSortMode(raw);
  } catch {
    /* ignore */
  }
  return "savedAtDesc";
}

export function writeSavedRfpSortMode(mode: SavedRfpSortMode) {
  try {
    localStorage.setItem(SAVED_RFP_SORT_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function recordByRfpId(records: SavedRfpRecord[]) {
  return new Map(records.map((r) => [r.rfpId, r]));
}

function compareTitle(a: Rfp, b: Rfp) {
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

function compareDueDate(a: Rfp, b: Rfp) {
  const da = new Date(`${a.dueDate}T12:00:00`).getTime();
  const db = new Date(`${b.dueDate}T12:00:00`).getTime();
  if (da !== db) return da - db;
  return compareTitle(a, b);
}

function compareSavedAt(
  a: Rfp,
  b: Rfp,
  meta: Map<string, SavedRfpRecord>,
  direction: "asc" | "desc",
) {
  const sa = meta.get(a.id)?.savedAt ?? "";
  const sb = meta.get(b.id)?.savedAt ?? "";
  const cmp = sa.localeCompare(sb);
  if (cmp !== 0) return direction === "asc" ? cmp : -cmp;
  return compareTitle(a, b);
}

/** Sort saved RFP rows for the profile list. */
export function sortSavedRfps(
  rfps: Rfp[],
  records: SavedRfpRecord[],
  mode: SavedRfpSortMode,
): Rfp[] {
  const meta = recordByRfpId(records);
  const list = [...rfps];

  switch (mode) {
    case "dueDateAsc":
      return list.sort(compareDueDate);
    case "dueDateDesc":
      return list.sort((a, b) => compareDueDate(b, a));
    case "savedAtDesc":
      return list.sort((a, b) => compareSavedAt(a, b, meta, "desc"));
    case "savedAtAsc":
      return list.sort((a, b) => compareSavedAt(a, b, meta, "asc"));
    case "titleAsc":
      return list.sort(compareTitle);
    case "titleDesc":
      return list.sort((a, b) => compareTitle(b, a));
    case "custom":
      return list.sort((a, b) => {
        const pa = meta.get(a.id)?.sortPosition;
        const pb = meta.get(b.id)?.sortPosition;
        const aPos = pa ?? Number.MAX_SAFE_INTEGER;
        const bPos = pb ?? Number.MAX_SAFE_INTEGER;
        if (aPos !== bPos) return aPos - bPos;
        return compareSavedAt(a, b, meta, "asc");
      });
    default:
      return list;
  }
}

export function nextSortPosition(records: SavedRfpRecord[]): number {
  if (records.length === 0) return 0;
  const max = Math.max(
    ...records.map((r) =>
      r.sortPosition == null ? -1 : r.sortPosition,
    ),
  );
  return max + 1;
}

export function formatSavedAtLabel(savedAt: string | undefined): string | null {
  if (!savedAt) return null;
  const d = new Date(savedAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function showsDueDateSubtitle(mode: SavedRfpSortMode): boolean {
  return mode === "dueDateAsc" || mode === "dueDateDesc";
}

export function showsSavedAtSubtitle(mode: SavedRfpSortMode): boolean {
  return mode === "savedAtAsc" || mode === "savedAtDesc";
}

/** Move `draggedId` to the index of `targetId` in an id list. */
export function reorderIdList(
  ids: string[],
  draggedId: string,
  targetId: string,
): string[] {
  if (draggedId === targetId) return ids;
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return ids;
  const next = [...ids];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

/** Preview order while dragging one saved RFP onto another's slot. */
export function reorderSavedRfpList<T extends { id: string }>(
  items: T[],
  draggedId: string,
  targetId: string,
): T[] {
  const order = reorderIdList(
    items.map((i) => i.id),
    draggedId,
    targetId,
  );
  const byId = new Map(items.map((i) => [i.id, i]));
  return order
    .map((id) => byId.get(id))
    .filter((item): item is T => item != null);
}

export function buildSavedRfpRecordsInOrder(
  records: SavedRfpRecord[],
  orderedIds: string[],
): SavedRfpRecord[] {
  const byId = new Map(records.map((r) => [r.rfpId, r]));
  const next: SavedRfpRecord[] = [];
  for (let index = 0; index < orderedIds.length; index++) {
    const rfpId = orderedIds[index];
    const row = byId.get(rfpId);
    if (row) {
      next.push({ ...row, sortPosition: index });
    }
  }
  return next;
}
