"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  defaultContractorProfile,
  type CompatibilityScore,
  type ContractorProfile,
  type Rfp,
} from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import {
  contractorRowToProfile,
  mapRfpRow,
  profileToContractorUpdate,
} from "@/lib/mappers";
import {
  captureEvent,
  identifySessionUser,
  resetPosthog,
} from "@/lib/analytics";
import { formatRfpSummaryMarkdown, RfpSummarySchema } from "@/lib/rfpSummary";

export type RfpFilter = {
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
  /**
   * Show the structured summary for an RFP in the AI tab. Returns "cached"
   * if a row was found in `rfp_summaries`, "generated" if the LLM produced
   * a fresh summary via /api/summary, or "failed" otherwise.
   */
  loadOrGenerateSummary: (
    rfpId: string,
  ) => Promise<"cached" | "generated" | "failed">;
  /** True while /api/summary is in flight for this RFP. */
  isGeneratingSummary: (rfpId: string) => boolean;
  /** True when a compatibility score is being computed for this RFP. */
  isScoring: (id: string) => boolean;
  /** True when no cached score has been computed yet for this RFP. */
  isUnscored: (id: string) => boolean;
  /** Trigger scoring for one RFP (idempotent; no-op while in flight). */
  ensureScored: (rfpId: string) => Promise<void>;
  /** Structured factor breakdown for a (contractor, RFP) pair, if available. */
  getMatchFactors: (rfpId: string) => CompatibilityScore | null;
  profileOpen: boolean;
  setProfileOpen: (open: boolean) => void;
  walkthroughActive: boolean;
  setWalkthroughActive: (active: boolean) => void;
  walkthroughStep: number;
  setWalkthroughStep: (step: number) => void;
  toast: string | null;
  showToast: (message: string) => void;
  rfpFilter: RfpFilter;
  setRfpFilter: (filter: RfpFilter) => void;
  signOut: () => Promise<void>;
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
  const [walkthroughActive, setWalkthroughActive] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(0);
  const [rfpFilter, setRfpFilter] = useState<RfpFilter>({});
  const [toast, setToast] = useState<string | null>(null);
  const [activeNav, setActiveNavState] = useState<ActiveNav>("dashboard");
  const [scoringRfpIds, setScoringRfpIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [unscoredRfpIds, setUnscoredRfpIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [matchFactorsById, setMatchFactorsById] = useState<
    Map<string, CompatibilityScore>
  >(() => new Map());
  const inFlightScoresRef = useRef<Set<string>>(new Set());
  const inFlightSummariesRef = useRef<Set<string>>(new Set());
  const [summariesInFlight, setSummariesInFlight] = useState<Set<string>>(
    () => new Set(),
  );
  const loadedRfpsRef = useRef<Rfp[]>([]);
  useEffect(() => {
    loadedRfpsRef.current = loadedRfps;
  }, [loadedRfps]);

  const setActiveNav = useCallback((nav: ActiveNav) => {
    captureEvent("main_nav_changed", { nav });
    setActiveNavState(nav);
  }, []);

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
          return;
        }

        const mapped =
          rfpRows?.map((row) => mapRfpRow(row, cid, scoreRows ?? undefined)) ??
          [];
        setLoadedRfps(mapped);

        const scoredRfpIds = new Set(
          (scoreRows ?? []).map((s) => s.rfp_id),
        );
        const factorsMap = new Map<string, CompatibilityScore>();
        for (const s of scoreRows ?? []) {
          if (
            s.factors &&
            typeof s.factors === "object" &&
            !Array.isArray(s.factors)
          ) {
            factorsMap.set(
              s.rfp_id,
              s.factors as unknown as CompatibilityScore,
            );
          }
        }
        setMatchFactorsById(factorsMap);
        const unscored = new Set(
          (rfpRows ?? [])
            .filter((r) => !scoredRfpIds.has(r.id))
            .map((r) => r.id),
        );
        setUnscoredRfpIds(unscored);

        identifySessionUser(userId, { contractor_id: cid });
      } catch (e) {
        console.error("loadWorkspace failed:", e);
        const msg = e instanceof Error ? e.message : "Unexpected error";
        showToast(msg);
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
    setUnscoredRfpIds(new Set());
    setScoringRfpIds(new Set());
    setMatchFactorsById(new Map());
    inFlightScoresRef.current.clear();
  }, []);

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

  const isScoring = useCallback(
    (id: string) => scoringRfpIds.has(id),
    [scoringRfpIds],
  );

  const isUnscored = useCallback(
    (id: string) => unscoredRfpIds.has(id),
    [unscoredRfpIds],
  );

  const getMatchFactors = useCallback(
    (id: string) => matchFactorsById.get(id) ?? null,
    [matchFactorsById],
  );

  const ensureScored = useCallback(
    async (rfpId: string, options: { force?: boolean } = {}) => {
      if (!contractorId) return;
      if (inFlightScoresRef.current.has(rfpId)) return;
      inFlightScoresRef.current.add(rfpId);
      setScoringRfpIds((prev) => {
        const next = new Set(prev);
        next.add(rfpId);
        return next;
      });
      try {
        const res = await fetch("/api/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contractor_id: contractorId,
            rfp_id: rfpId,
            ...(options.force ? { force: true } : {}),
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          score?: number;
          factors?: CompatibilityScore;
        };
        const score = Number(data.score);
        if (!Number.isFinite(score)) return;
        setLoadedRfps((prev) =>
          prev.map((r) => (r.id === rfpId ? { ...r, score } : r)),
        );
        setUnscoredRfpIds((prev) => {
          if (!prev.has(rfpId)) return prev;
          const next = new Set(prev);
          next.delete(rfpId);
          return next;
        });
        if (data.factors) {
          setMatchFactorsById((prev) => {
            const next = new Map(prev);
            next.set(rfpId, data.factors as CompatibilityScore);
            return next;
          });
        }
      } catch {
        // Silently leave at fallback; user can retry.
      } finally {
        inFlightScoresRef.current.delete(rfpId);
        setScoringRfpIds((prev) => {
          if (!prev.has(rfpId)) return prev;
          const next = new Set(prev);
          next.delete(rfpId);
          return next;
        });
      }
    },
    [contractorId],
  );

  const selectRfp = useCallback(
    (id: string | null) => {
      if (id) {
        captureEvent("rfp_selected", { rfp_id: id });
        // Always re-score on click: forces a fresh computation against the
        // current contractor profile so the displayed factor breakdown is
        // current even if the underlying RFP or profile state has shifted
        // since the last cached score.
        void ensureScored(id, { force: true });
      }
      setSelectedRfpId(id);
    },
    [ensureScored],
  );

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
        captureEvent("rfp_save_toggled", { rfp_id: id, now_saved: false });
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
        captureEvent("rfp_save_toggled", { rfp_id: id, now_saved: true });
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
      const clientNames = Array.from(
        new Set(
          p.pastClients
            .split(/[,;\n]+/)
            .map((c) => c.trim())
            .filter(Boolean)
            .map((c) => [c.toLowerCase(), c] as const)
            .reduce<Map<string, string>>((acc, [key, original]) => {
              if (!acc.has(key)) acc.set(key, original);
              return acc;
            }, new Map())
            .values(),
        ),
      );

      const rowsToInsert: {
        contractor_id: string;
        project_name: string;
        description: string | null;
        client: string | null;
        tags: string[];
      }[] = [];

      if (blob) {
        rowsToInsert.push({
          contractor_id: contractorId,
          project_name: "Experience profile",
          description: blob,
          client: null,
          tags: [],
        });
      }
      for (const client of clientNames) {
        rowsToInsert.push({
          contractor_id: contractorId,
          project_name: client,
          description: null,
          client,
          tags: [],
        });
      }

      if (rowsToInsert.length > 0) {
        const { error: insErr } = await supabase
          .from("contractor_past_projects")
          .insert(rowsToInsert);
        if (insErr) {
          showToast(insErr.message);
          return;
        }
      }

      setProfileState(p);
      // Profile changed → cached scores are now stale. Clear displayed scores
      // and let the background batch effect re-score against the new profile.
      setLoadedRfps((prev) => prev.map((r) => ({ ...r, score: 0 })));
      setUnscoredRfpIds(new Set(loadedRfps.map((r) => r.id)));
      setMatchFactorsById(new Map());
      showToast("Profile saved.");
      captureEvent("profile_saved", { contractor_id: contractorId });
    },
    [contractorId, loadedRfps, showToast],
  );

  // Fire-and-forget background scoring with a small concurrency limit. Used to
  // backfill scores for the top of the user's feed without blocking the UI.
  const runScoreBatch = useCallback(
    (rfpIds: string[]) => {
      const CONCURRENCY = 2;
      const queue = [...rfpIds];
      const worker = async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) return;
          await ensureScored(next);
        }
      };
      void Promise.all(
        Array.from({ length: CONCURRENCY }, () => worker()),
      );
    },
    [ensureScored],
  );

  // After RFPs load (or after profile save bumps staleness), backfill scores
  // for the visible top of the feed. Only run when the profile has at least
  // some signal to score against, to avoid wasted LLM spend.
  useEffect(() => {
    if (!contractorId) return;
    if (unscoredRfpIds.size === 0) return;
    const hasSignal =
      profile.industries.trim() ||
      profile.subIndustries.trim() ||
      profile.goals.trim() ||
      profile.pastExperience.trim() ||
      profile.pastClients.trim();
    if (!hasSignal) return;

    const MAX_PER_BATCH = 100;
    const ids = loadedRfps
      .filter((r) => unscoredRfpIds.has(r.id))
      .slice(0, MAX_PER_BATCH)
      .map((r) => r.id);
    if (ids.length > 0) runScoreBatch(ids);
    // Only one pass per workspace load; subsequent saves will re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractorId, loadedRfps.length]);

  const isGeneratingSummary = useCallback(
    (rfpId: string) => summariesInFlight.has(rfpId),
    [summariesInFlight],
  );

  const loadOrGenerateSummary = useCallback(
    async (
      rfpId: string,
    ): Promise<"cached" | "generated" | "failed"> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("rfp_summaries")
        .select("summary")
        .eq("rfp_id", rfpId)
        .eq("summary_type", "general")
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data?.summary) {
        setLoadedRfps((prev) =>
          prev.map((r) =>
            r.id === rfpId ? { ...r, summaryMarkdown: data.summary } : r,
          ),
        );
        return "cached";
      }

      if (inFlightSummariesRef.current.has(rfpId)) {
        return "failed";
      }

      const rfp = loadedRfpsRef.current.find((r) => r.id === rfpId);
      if (!rfp) return "failed";

      const rfpText = [
        rfp.description,
        rfp.statementOfWork
          ? `Statement of Work:\n${rfp.statementOfWork}`
          : "",
        rfp.deliverables.length
          ? `Deliverables:\n- ${rfp.deliverables.join("\n- ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim();
      if (!rfpText) return "failed";

      inFlightSummariesRef.current.add(rfpId);
      setSummariesInFlight((prev) => {
        const next = new Set(prev);
        next.add(rfpId);
        return next;
      });

      try {
        const res = await fetch("/api/summary", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rfpText, rfpTitle: rfp.title }),
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          showToast(errBody?.error ?? `Summary generation failed (${res.status}).`);
          return "failed";
        }
        const json = await res.json();
        const parsed = RfpSummarySchema.safeParse(json);
        if (!parsed.success) {
          console.error("[summary] schema parse failed:", parsed.error, json);
          showToast("Summary response was not in the expected shape.");
          return "failed";
        }
        const markdown = formatRfpSummaryMarkdown(parsed.data);
        setLoadedRfps((prev) =>
          prev.map((r) =>
            r.id === rfpId ? { ...r, summaryMarkdown: markdown } : r,
          ),
        );
        return "generated";
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Network error";
        showToast(msg);
        return "failed";
      } finally {
        inFlightSummariesRef.current.delete(rfpId);
        setSummariesInFlight((prev) => {
          const next = new Set(prev);
          next.delete(rfpId);
          return next;
        });
      }
    },
    [showToast],
  );

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    resetPosthog();
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
      loadOrGenerateSummary,
      isGeneratingSummary,
      isScoring,
      isUnscored,
      ensureScored,
      getMatchFactors,
      profileOpen,
      setProfileOpen,
      walkthroughActive,
      setWalkthroughActive,
      walkthroughStep,
      setWalkthroughStep,
      toast,
      showToast,
      rfpFilter,
      setRfpFilter,
      signOut,
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
      loadOrGenerateSummary,
      isGeneratingSummary,
      isScoring,
      isUnscored,
      ensureScored,
      getMatchFactors,
      profileOpen,
      walkthroughActive,
      walkthroughStep,
      toast,
      showToast,
      rfpFilter,
      signOut,
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
