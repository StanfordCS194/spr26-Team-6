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

const STORAGE_KEY = "bagea-dashboard-v1";

type Persisted = {
  profile: ContractorProfile;
  savedRfpIds: number[];
};

function loadPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
  filteredRfps: Rfp[];
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
  const [toast, setToast] = useState<string | null>(null);

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
    if (!q) return MOCK_RFPS;
    return MOCK_RFPS.filter((r) => {
      const hay = [
        r.title,
        r.agency,
        r.location,
        r.description,
        ...r.tags,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [searchQuery]);

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
    }),
    [
      filteredRfps,
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
