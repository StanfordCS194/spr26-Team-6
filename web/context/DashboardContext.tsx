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
import { createClient } from "@/lib/supabase/client";
import {
  contractorRowToProfile,
  mapRfpRow,
  profileToContractorUpdate,
} from "@/lib/mappers";

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

type DashboardContextValue = {
  authReady: boolean;
  loadedRfps: Rfp[];
  filteredRfps: Rfp[];
  feedRfps: Rfp[];
  activeNav: ActiveNav;
  setActiveNav: (nav: ActiveNav) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedRfpId: string | null;
  selectRfp: (id: string | null) => void;
  selectedRfp: Rfp | null;
  savedRfpIds: string[];
  isSaved: (id: string) => boolean;
  toggleSaveRfp: (id: string) => Promise<void>;
  profile: ContractorProfile;
  setProfile: (p: Partial<ContractorProfile>) => void;
  saveProfile: (p: ContractorProfile) => Promise<void>;
  tryLoadCachedSummary: (rfpId: string) => Promise<boolean>;
  profileOpen: boolean;
  setProfileOpen: (open: boolean) => void;
  toast: string | null;
  showToast: (message: string) => void;
  rfpFilter: RfpFilter;
  setRfpFilter: (filter: RfpFilter) => void;
  signOut: () => Promise<void>;
  /** True while contractor + RFP + scores fetch runs */
  workspaceLoading: boolean;
  /** Last load outcome: counts from DB or an error string */
  workspaceStatusLine: string | null;
  /** Re-run Supabase queries (same as after login) */
  refetchWorkspace: () => Promise<void>;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [loadedRfps, setLoadedRfps] = useState<Rfp[]>([]);
  const [savedRfpIds, setSavedRfpIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRfpId, setSelectedRfpId] = useState<string | null>(null);
  const [profile, setProfileState] = useState<ContractorProfile>(
    defaultContractorProfile,
  );
  const [profileOpen, setProfileOpen] = useState(false);
  const [rfpFilter, setRfpFilter] = useState<RfpFilter>({});
  const [toast, setToast] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<ActiveNav>("dashboard");
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceStatusLine, setWorkspaceStatusLine] = useState<string | null>(
    null,
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const setProfile = useCallback((p: Partial<ContractorProfile>) => {
    setProfileState((prev) => ({ ...prev, ...p }));
  }, []);

  const loadWorkspace = useCallback(
    async (userId: string, email: string | undefined) => {
      const supabase = createClient();
      setWorkspaceLoading(true);
      setWorkspaceStatusLine("Loading from Supabase…");

      try {
        let { data: contractor } = await supabase
          .from("contractors")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (!contractor) {
          const companyName = email?.split("@")[0]?.trim() || "Contractor";
          const { data: inserted, error: insErr } = await supabase
            .from("contractors")
            .insert({
              user_id: userId,
              company_name: companyName,
            })
            .select()
            .single();
          if (insErr || !inserted) {
            const msg =
              insErr?.message ?? "Could not create contractor profile.";
            showToast(msg);
            setWorkspaceStatusLine(`Contractor: ${msg}`);
            setContractorId(null);
            setLoadedRfps([]);
            setSavedRfpIds([]);
            setProfileState(defaultContractorProfile);
            return;
          }
          contractor = inserted;
        }

        const cid = contractor.id;
        setContractorId(cid);

        const { data: pastRows } = await supabase
          .from("contractor_past_projects")
          .select("*")
          .eq("contractor_id", cid);

        setProfileState(
          contractorRowToProfile(contractor, pastRows ?? []),
        );

        const { data: savedRows } = await supabase
          .from("saved_rfps")
          .select("rfp_id")
          .eq("contractor_id", cid);
        const savedList = savedRows?.map((r) => r.rfp_id) ?? [];
        setSavedRfpIds(savedList);

        const { data: scoreRows } = await supabase
          .from("scores")
          .select("*")
          .eq("contractor_id", cid);

        const { data: rfpRows, error: rfpErr } = await supabase
          .from("rfps")
          .select("*")
          .eq("status", "active")
          .eq("is_relevant", true)
          .order("due_date", { ascending: true, nullsFirst: false });

        if (rfpErr) {
          showToast(rfpErr.message);
          setLoadedRfps([]);
          setWorkspaceStatusLine(`RFP query failed: ${rfpErr.message}`);
          return;
        }

        const mapped =
          rfpRows?.map((row) => mapRfpRow(row, cid, scoreRows ?? undefined)) ??
          [];
        setLoadedRfps(mapped);

        const scoreN = scoreRows?.length ?? 0;
        setWorkspaceStatusLine(
          `Pulled ${mapped.length} RFP row(s) (active + is_relevant=true), ${scoreN} score row(s), ${savedList.length} saved link(s).`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unexpected error";
        setWorkspaceStatusLine(`Error: ${msg}`);
        showToast(msg);
      } finally {
        setWorkspaceLoading(false);
      }
    },
    [showToast],
  );

  const clearWorkspace = useCallback(() => {
    setContractorId(null);
    setLoadedRfps([]);
    setSavedRfpIds([]);
    setProfileState(defaultContractorProfile);
    setSelectedRfpId(null);
    setWorkspaceStatusLine(null);
    setWorkspaceLoading(false);
  }, []);

  const refetchWorkspace = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await loadWorkspace(user.id, user.email ?? undefined);
  }, [loadWorkspace]);

  useEffect(() => {
    const supabase = createClient();

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await loadWorkspace(user.id, user.email ?? undefined);
      } else {
        clearWorkspace();
      }
      startTransition(() => setAuthReady(true));
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      startTransition(() => {
        void (async () => {
          if (session?.user) {
            await loadWorkspace(
              session.user.id,
              session.user.email ?? undefined,
            );
          } else {
            clearWorkspace();
          }
          setAuthReady(true);
        })();
      });
    });

    return () => subscription.unsubscribe();
  }, [loadWorkspace, clearWorkspace]);

  const filteredRfps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return loadedRfps.filter((r) => {
      if (q) {
        const hay = [r.title, r.agency, r.location, r.description, ...r.tags]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (rfpFilter.tag && rfpFilter.tag !== "") {
        if (
          !r.tags.some(
            (tag) => tag.toLowerCase() === rfpFilter.tag?.toLowerCase(),
          )
        ) {
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
  }, [loadedRfps, searchQuery, rfpFilter]);

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

  const selectedRfp = useMemo(() => {
    if (selectedRfpId == null) return null;
    return loadedRfps.find((r) => r.id === selectedRfpId) ?? null;
  }, [loadedRfps, selectedRfpId]);

  const selectRfp = useCallback((id: string | null) => {
    setSelectedRfpId(id);
  }, []);

  const isSaved = useCallback(
    (id: string) => savedRfpIds.includes(id),
    [savedRfpIds],
  );

  const toggleSaveRfp = useCallback(
    async (id: string) => {
      if (!contractorId) {
        showToast("Profile not ready yet.");
        return;
      }
      const supabase = createClient();
      const saved = savedRfpIds.includes(id);
      if (saved) {
        const { error } = await supabase
          .from("saved_rfps")
          .delete()
          .eq("contractor_id", contractorId)
          .eq("rfp_id", id);
        if (error) {
          showToast(error.message);
          return;
        }
        setSavedRfpIds((prev) => prev.filter((x) => x !== id));
      } else {
        const { error } = await supabase.from("saved_rfps").insert({
          contractor_id: contractorId,
          rfp_id: id,
        });
        if (error) {
          showToast(error.message);
          return;
        }
        setSavedRfpIds((prev) => [...prev, id]);
      }
    },
    [contractorId, savedRfpIds, showToast],
  );

  const saveProfile = useCallback(
    async (p: ContractorProfile) => {
      if (!contractorId) {
        showToast("Profile not ready yet.");
        return;
      }
      const supabase = createClient();
      const update = profileToContractorUpdate(p);
      const { error: upErr } = await supabase
        .from("contractors")
        .update(update)
        .eq("id", contractorId);
      if (upErr) {
        showToast(upErr.message);
        return;
      }

      const { error: delErr } = await supabase
        .from("contractor_past_projects")
        .delete()
        .eq("contractor_id", contractorId);
      if (delErr) {
        showToast(delErr.message);
        return;
      }

      const blob = p.pastExperience.trim();
      if (blob) {
        const { error: insErr } = await supabase
          .from("contractor_past_projects")
          .insert({
            contractor_id: contractorId,
            project_name: "Experience profile",
            description: blob,
            tags: [],
          });
        if (insErr) {
          showToast(insErr.message);
          return;
        }
      }

      setProfileState(p);
      showToast("Profile saved.");
    },
    [contractorId, showToast],
  );

  const tryLoadCachedSummary = useCallback(
    async (rfpId: string): Promise<boolean> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("rfp_summaries")
        .select("summary")
        .eq("rfp_id", rfpId)
        .eq("summary_type", "general")
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data?.summary) {
        return false;
      }
      setLoadedRfps((prev) =>
        prev.map((r) =>
          r.id === rfpId
            ? { ...r, aiAnalysisMarkdown: data.summary }
            : r,
        ),
      );
      return true;
    },
    [],
  );

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  const value = useMemo<DashboardContextValue>(
    () => ({
      authReady,
      loadedRfps,
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
      saveProfile,
      tryLoadCachedSummary,
      profileOpen,
      setProfileOpen,
      toast,
      showToast,
      rfpFilter,
      setRfpFilter,
      signOut,
      workspaceLoading,
      workspaceStatusLine,
      refetchWorkspace,
    }),
    [
      authReady,
      loadedRfps,
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
      saveProfile,
      tryLoadCachedSummary,
      profileOpen,
      toast,
      showToast,
      rfpFilter,
      signOut,
      workspaceLoading,
      workspaceStatusLine,
      refetchWorkspace,
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
