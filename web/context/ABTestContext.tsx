"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { trackABTestEvent } from "@/app/posthog-provider";

export type Variant = "A" | "B";

interface ABTestState {
  dashboardVariant: Variant;
  detailPanelVariant: Variant;
}

interface ABTestContextValue extends ABTestState {
  toggleDashboardVariant: () => void;
  toggleDetailPanelVariant: () => void;
  setDashboardVariant: (variant: Variant) => void;
  setDetailPanelVariant: (variant: Variant) => void;
}

const ABTestContext = createContext<ABTestContextValue | null>(null);

const STORAGE_KEY = "govbid-ab-test-variants";

function getInitialState(): ABTestState {
  if (typeof window === "undefined") {
    return { dashboardVariant: "A", detailPanelVariant: "A" };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ABTestState>;
      return {
        dashboardVariant: parsed.dashboardVariant === "B" ? "B" : "A",
        detailPanelVariant: parsed.detailPanelVariant === "B" ? "B" : "A",
      };
    }
  } catch {
    // Ignore localStorage errors
  }

  return { dashboardVariant: "A", detailPanelVariant: "A" };
}

export function ABTestProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ABTestState>({
    dashboardVariant: "A",
    detailPanelVariant: "A",
  });
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setState(getInitialState());
    setIsHydrated(true);
  }, []);

  // Persist to localStorage when state changes
  useEffect(() => {
    if (isHydrated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [state, isHydrated]);

  const toggleDashboardVariant = useCallback(() => {
    setState((prev) => {
      const newVariant = prev.dashboardVariant === "A" ? "B" : "A";
      trackABTestEvent("ab_test_variant_switched", {
        component: "dashboard",
        from_variant: prev.dashboardVariant,
        to_variant: newVariant,
      });
      return { ...prev, dashboardVariant: newVariant };
    });
  }, []);

  const toggleDetailPanelVariant = useCallback(() => {
    setState((prev) => {
      const newVariant = prev.detailPanelVariant === "A" ? "B" : "A";
      trackABTestEvent("ab_test_variant_switched", {
        component: "detail_panel",
        from_variant: prev.detailPanelVariant,
        to_variant: newVariant,
      });
      return { ...prev, detailPanelVariant: newVariant };
    });
  }, []);

  const setDashboardVariant = useCallback((variant: Variant) => {
    setState((prev) => {
      if (prev.dashboardVariant !== variant) {
        trackABTestEvent("ab_test_variant_switched", {
          component: "dashboard",
          from_variant: prev.dashboardVariant,
          to_variant: variant,
        });
      }
      return { ...prev, dashboardVariant: variant };
    });
  }, []);

  const setDetailPanelVariant = useCallback((variant: Variant) => {
    setState((prev) => {
      if (prev.detailPanelVariant !== variant) {
        trackABTestEvent("ab_test_variant_switched", {
          component: "detail_panel",
          from_variant: prev.detailPanelVariant,
          to_variant: variant,
        });
      }
      return { ...prev, detailPanelVariant: variant };
    });
  }, []);

  return (
    <ABTestContext.Provider
      value={{
        ...state,
        toggleDashboardVariant,
        toggleDetailPanelVariant,
        setDashboardVariant,
        setDetailPanelVariant,
      }}
    >
      {children}
    </ABTestContext.Provider>
  );
}

export function useABTest() {
  const context = useContext(ABTestContext);
  if (!context) {
    throw new Error("useABTest must be used within an ABTestProvider");
  }
  return context;
}
