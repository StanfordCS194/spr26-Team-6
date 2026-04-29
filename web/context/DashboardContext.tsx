"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  defaultContractorProfile,
  type ContractorProfile,
  type Rfp,
} from "@/lib/types";
import { MOCK_RFPS } from "@/lib/mockData";

const STORAGE_KEY = "govbid-dashboard-v1";
const LEGACY_STORAGE_KEY = "bagea-dashboard-v1";

type Persisted = {
  profile: ContractorProfile;
  savedRfpIds: number[];
};

type RfpFilter = {
  tag?: string;
  dateFrom?: string;
  dateTo?: string;
  priceMin?: number;
  priceMax?: number;
};

export type ActiveNav = "dashboard" | "saved" | "history";

function parseContractValue(value: string) {
  const normalized = value.replace(/\$/g, "").replace(/,/g, "").trim().toUpperCase();
  if (normalized.endsWith("M")) {
    return Number(normalized.slice(0, -1)) * 1_000_000;
  }
  if (normalized.endsWith("K")) {
    return Number(normalized.slice(0, -1)) * 1_000;
  }
  return Number(normalized) || 0;
}

function loadPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    if (!raw) return null;
    return JSON.parse(raw) as Persisted;
  } catch {
    return null;
  }
}

function savePersisted(data: Persisted) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

type DashboardContextValue = {
  /** RFPs matching search + sidebar filters (full catalog). */
  filteredRfps: Rfp[];
  /** RFPs shown in the main feed for the current top nav (dashboard / saved / history). */
  feedRfps: Rfp[];
  activeNav: ActiveNav;
  setActiveNav: (nav: ActiveNav) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedRfpId: number | null;
  selectRfp: (id: number | null) => void;
  selectedRfp: Rfp | null;
  savedRfpIds: number[];
  isSaved: (id: number) => boolean;
  toggleSaveRfp: (id: number) => void;
  profile: ContractorProfile;
  setProfile: (p: Partial<ContractorProfile>) => void;
  profileOpen: boolean;
  setProfileOpen: (open: boolean) => void;
  toast: string | null;
  showToast: (message: string) => void;
  rfpFilter: RfpFilter;
  setRfpFilter: (filter: RfpFilter) => void;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRfpId, setSelectedRfpId] = useState<number | null>(null);
  const [savedRfpIds, setSavedRfpIds] = useState<number[]>([]);
  const [profile, setProfileState] = useState<ContractorProfile>(
    defaultContractorProfile,
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [rfpFilter, setRfpFilter] = useState<RfpFilter>({});
  const [toast, setToast] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<ActiveNav>("dashboard");

  useEffect(() => {
    const persisted = loadPersisted();
    startTransition(() => {
      if (persisted?.profile) {
        setProfileState({ ...defaultContractorProfile, ...persisted.profile });
      }
      if (persisted?.savedRfpIds?.length) {
        setSavedRfpIds(persisted.savedRfpIds);
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePersisted({ profile, savedRfpIds });
  }, [hydrated, profile, savedRfpIds]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const setProfile = useCallback((p: Partial<ContractorProfile>) => {
    setProfileState((prev) => ({ ...prev, ...p }));
  }, []);

  const filteredRfps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return MOCK_RFPS.filter((r) => {
      if (q) {
        const hay = [
          r.title,
          r.agency,
          r.location,
          r.description,
          ...r.tags,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (rfpFilter.tag && rfpFilter.tag !== "") {
        if (!r.tags.some((tag) => tag.toLowerCase() === rfpFilter.tag?.toLowerCase())) {
          return false;
        }
      }

      if (rfpFilter.dateFrom) {
        const from = new Date(rfpFilter.dateFrom);
        if (Number(new Date(r.dueDate)) < Number(from)) {
          return false;
        }
      }

      if (rfpFilter.dateTo) {
        const to = new Date(rfpFilter.dateTo);
        if (Number(new Date(r.dueDate)) > Number(to)) {
          return false;
        }
      }

      const amount = parseContractValue(r.contract);

      if (typeof rfpFilter.priceMin === "number") {
        if (amount < rfpFilter.priceMin) return false;
      }

      if (typeof rfpFilter.priceMax === "number") {
        if (amount > rfpFilter.priceMax) return false;
      }

      return true;
    });
  }, [searchQuery, rfpFilter]);

  const feedRfps = useMemo(() => {
    if (activeNav === "dashboard") {
      return filteredRfps;
    }
    if (activeNav === "saved") {
      const saved = new Set(savedRfpIds);
      return filteredRfps.filter((r) => saved.has(r.id));
    }
    return [] as Rfp[];
  }, [activeNav, filteredRfps, savedRfpIds]);

  useEffect(() => {
    if (selectedRfpId == null) return;
    if (!feedRfps.some((r) => r.id === selectedRfpId)) {
      startTransition(() => {
        setSelectedRfpId(null);
      });
    }
  }, [feedRfps, selectedRfpId]);

  const selectedRfp =
    selectedRfpId == null
      ? null
      : (MOCK_RFPS.find((r) => r.id === selectedRfpId) ?? null);

  const selectRfp = useCallback((id: number | null) => {
    setSelectedRfpId(id);
  }, []);

  const isSaved = useCallback(
    (id: number) => savedRfpIds.includes(id),
    [savedRfpIds],
  );

  const toggleSaveRfp = useCallback((id: number) => {
    setSavedRfpIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const value = useMemo<DashboardContextValue>(
    () => ({
      filteredRfps,
      feedRfps,
      activeNav,
      setActiveNav,
      searchQuery,
      setSearchQuery,
      selectedRfpId,
      selectRfp,
      selectedRfp,
      savedRfpIds,
      isSaved,
      toggleSaveRfp,
      profile,
      setProfile,
      profileOpen,
      setProfileOpen,
      toast,
      showToast,
      rfpFilter,
      setRfpFilter,
    }),
    [
      filteredRfps,
      feedRfps,
      activeNav,
      searchQuery,
      selectedRfpId,
      selectRfp,
      selectedRfp,
      savedRfpIds,
      isSaved,
      toggleSaveRfp,
      profile,
      setProfile,
      profileOpen,
      toast,
      showToast,
      rfpFilter,
      setRfpFilter,
    ],
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard must be used within DashboardProvider");
  }
  return ctx;
}
