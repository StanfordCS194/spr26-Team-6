"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WalkthroughOverlay } from "./WalkthroughOverlay";
import { WalkthroughTooltip } from "./WalkthroughTooltip";
import { WalkthroughMePointer } from "./WalkthroughMePointer";
import { WalkthroughClickShield } from "./WalkthroughClickShield";
import { useDashboard } from "@/context/DashboardContext";
import { captureEvent } from "@/lib/analytics";
import {
  WALKTHROUGH_CLEAR_RFP_FOCUS_EVENT,
  WALKTHROUGH_FOCUS_RFP_EVENT,
  WALKTHROUGH_SHOW_DETAIL_OVERVIEW_EVENT,
} from "@/lib/walkthroughEvents";

export {
  WALKTHROUGH_FOCUS_CARD_EVENT,
  WALKTHROUGH_FOCUS_RFP_EVENT,
} from "@/lib/walkthroughEvents";

export type WalkthroughStep =
  | "intro"
  | "setup-profile"
  | "explore-dashboard"
  | "view-opportunities"
  | "completion";

interface WalkthroughContent {
  selector: string | null;
  title: string;
  description: string;
  descriptionAwaitingMe?: string;
}

type ExploreDashboardPhase = "filters" | "feed";
type ViewOpportunitiesPhase = "card" | "overview";

const EXPLORE_STEP_TITLE = "Step 2: Search & Filter RFPs";
const VIEW_STEP_TITLE = "Step 3: View & Save Opportunities";

const EXPLORE_DASHBOARD_PHASES: {
  id: ExploreDashboardPhase;
  selectors: string[];
  title: string;
  description: string;
}[] = [
  {
    id: "filters",
    selectors: [
      "#walkthrough-rfp-filters-panel",
      "#walkthrough-rfp-filters-panel-desktop",
      "#walkthrough-rfp-filters",
    ],
    title: EXPLORE_STEP_TITLE,
    description:
      "Use the sidebar to search keywords and narrow results by location, industry, topic, due date, or contract size. Active filters appear as chips you can remove.",
  },
  {
    id: "feed",
    selectors: ["#walkthrough-rfp-feed-list"],
    title: EXPLORE_STEP_TITLE,
    description:
      "Your feed lists curated opportunities matched to your profile. Scroll to browse.",
  },
];

const VIEW_OPPORTUNITIES_PHASES: {
  id: ViewOpportunitiesPhase;
  selectors: string[];
  title: string;
  description: string;
}[] = [
  {
    id: "card",
    selectors: ["#walkthrough-rfp-card-target"],
    title: VIEW_STEP_TITLE,
    description:
      "Click the highlighted opportunity in the list to open its details.",
  },
  {
    id: "overview",
    selectors: ["#walkthrough-detail-sidebar"],
    title: VIEW_STEP_TITLE,
    description:
      "Review the sidebar for project details, location, and other information. Use Save/Unsave to add or remove RFPs from your profile.",
  },
];

const WALKTHROUGH_STEPS: Record<WalkthroughStep, WalkthroughContent> = {
  intro: {
    selector: null,
    title: "Welcome to GovBid",
    description:
      "Your all-in-one platform for finding government contracting opportunities. In this 3-step tour, you'll learn how to set up your profile, explore opportunities, and manage your pipeline.\n\nLet's get started!",
  },
  "setup-profile": {
    selector: "#profile-drawer",
    title: "Step 1: Set Up Your Profile",
    descriptionAwaitingMe:
      "Open your company profile using the Me button in the top-right corner. Follow the bouncing arrow, then fill in your details.",
    description:
      "Your profile helps us match you with relevant opportunities. Saved profiles will personalize your recommendations.",
  },
  "explore-dashboard": {
    selector: null,
    title: EXPLORE_STEP_TITLE,
    description: "",
  },
  "view-opportunities": {
    selector: null,
    title: VIEW_STEP_TITLE,
    description: "",
  },
  completion: {
    selector: null,
    title: "You're Ready!",
    description:
      "You're all set to start exploring government contracts. Remember:\n\n• Update your profile for better recommendations\n• Use filters to find relevant opportunities\n• Save promising RFPs for later review\n\nHappy bidding!",
  },
};

const STEP_ORDER: WalkthroughStep[] = [
  "intro",
  "setup-profile",
  "explore-dashboard",
  "view-opportunities",
  "completion",
];

const ME_BUTTON_SELECTOR = "#walkthrough-profile-me-button";

type SetupProfilePhase = "me" | "drawer";

function isWalkthroughTargetVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function queryWalkthroughElements(selector: string): HTMLElement[] {
  return Array.from(document.querySelectorAll(selector)).filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
}

function resolveFirstWalkthroughTarget(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    for (const el of queryWalkthroughElements(selector)) {
      if (isWalkthroughTargetVisible(el)) {
        return el;
      }
    }
  }
  return null;
}

/** Highlight the scroll list and pagination footer (#rfp-feed). */
function resolveFeedScrollTarget(): {
  element: HTMLElement;
  rect: DOMRectReadOnly;
} | null {
  for (const feed of queryWalkthroughElements("#rfp-feed")) {
    if (!isWalkthroughTargetVisible(feed)) continue;

    const feedRect = feed.getBoundingClientRect();
    if (feedRect.width <= 0 || feedRect.height <= 0) continue;

    const list = feed.querySelector("#walkthrough-rfp-feed-list");
    const element = list instanceof HTMLElement ? list : feed;

    return { element, rect: feedRect };
  }

  return null;
}

type ExploreInteractHole = {
  element: HTMLElement | null;
  rect: DOMRectReadOnly | null;
};

function resolveExploreInteractHole(
  phase: ExploreDashboardPhase,
): ExploreInteractHole {
  if (phase === "filters") {
    const filtersAside = resolveFirstWalkthroughTarget([
      "#walkthrough-rfp-filters",
    ]);
    return {
      element: filtersAside,
      rect: null,
    };
  }

  const feedTarget = resolveFeedScrollTarget();
  return {
    element: null,
    rect: feedTarget?.rect ?? null,
  };
}

function pickWalkthroughTourRfpId(rfps: { id: string }[]): string | null {
  if (rfps.length === 0) return null;
  return rfps[Math.floor(Math.random() * rfps.length)]!.id;
}

function dispatchWalkthroughFocusRfp(rfpId: string) {
  window.dispatchEvent(
    new CustomEvent(WALKTHROUGH_FOCUS_RFP_EVENT, { detail: { rfpId } }),
  );
}

function resolveDetailSidebarTarget(): HTMLElement | null {
  return resolveFirstWalkthroughTarget(["#walkthrough-detail-sidebar"]);
}

function measureDetailSidebarRect(
  sidebar: HTMLElement,
): DOMRectReadOnly | null {
  const panel = sidebar.closest("#detail-panel");
  const anchor =
    panel instanceof HTMLElement && isWalkthroughTargetVisible(panel)
      ? panel
      : sidebar;

  const anchorRect = anchor.getBoundingClientRect();
  if (anchorRect.width <= 0 || anchorRect.height <= 0) return null;

  return new DOMRect(
    anchorRect.left,
    anchorRect.top,
    anchorRect.width,
    anchorRect.height,
  );
}

function resolveWalkthroughTargets(selectors: string[]): HTMLElement[] {
  const el = resolveFirstWalkthroughTarget(selectors);
  return el ? [el] : [];
}

function resolveExplorePhaseTarget(phase: ExploreDashboardPhase): HTMLElement[] {
  const config = EXPLORE_DASHBOARD_PHASES.find((p) => p.id === phase);
  if (!config) return [];
  return resolveWalkthroughTargets(config.selectors);
}

export function Walkthrough() {
  const {
    walkthroughActive,
    setWalkthroughActive,
    walkthroughStep,
    setWalkthroughStep,
    profileOpen,
    setProfileOpen,
    setFiltersPanelVisible,
    filtersPanelVisible,
    feedRfps,
    setActiveNav,
    selectRfp,
    selectedRfpId,
  } = useDashboard();

  const [targetElements, setTargetElements] = useState<HTMLElement[]>([]);
  const [spotlightRects, setSpotlightRects] = useState<
    (DOMRectReadOnly | undefined)[]
  >([]);
  const [interactHole, setInteractHole] = useState<ExploreInteractHole>({
    element: null,
    rect: null,
  });
  const [showCompletion, setShowCompletion] = useState(false);
  const [setupProfilePhase, setSetupProfilePhase] =
    useState<SetupProfilePhase>("me");
  /** True after the user opens Me once during step 1 (stays true if they close the drawer). */
  const [profileOpenedInStep1, setProfileOpenedInStep1] = useState(false);
  const [explorePhase, setExplorePhase] =
    useState<ExploreDashboardPhase>("filters");
  const [viewOpportunitiesPhase, setViewOpportunitiesPhase] =
    useState<ViewOpportunitiesPhase>("card");
  const [tourTargetRfpId, setTourTargetRfpId] = useState<string | null>(null);
  /** True after the user opens the tour card once during step 3 (stays true if they go back from part 2). */
  const [cardClickedInStep3, setCardClickedInStep3] = useState(false);
  const wasWalkthroughActive = useRef(false);
  const prevWalkthroughStep = useRef(walkthroughStep);
  /** Fixed spotlight/interact rect for step 3 part 2 (tab switches must not resize the hole). */
  const pinnedDetailSidebarRectRef = useRef<DOMRectReadOnly | null>(null);

  const getExplorePhaseIndex = useCallback(
    (phase: ExploreDashboardPhase) =>
      EXPLORE_DASHBOARD_PHASES.findIndex((p) => p.id === phase),
    [],
  );

  const getViewPhaseIndex = useCallback(
    (phase: ViewOpportunitiesPhase) =>
      VIEW_OPPORTUNITIES_PHASES.findIndex((p) => p.id === phase),
    [],
  );

  useEffect(() => {
    if (walkthroughActive && !wasWalkthroughActive.current) {
      captureEvent("walkthrough_started", { step_index: 0 });
    }
    wasWalkthroughActive.current = walkthroughActive;
  }, [walkthroughActive]);

  // Entering / leaving steps: reset sub-phases and layout.
  useEffect(() => {
    if (!walkthroughActive) return;

    const stepChanged = prevWalkthroughStep.current !== walkthroughStep;
    const currentStepId = STEP_ORDER[walkthroughStep];

    if (stepChanged && currentStepId === "setup-profile") {
      const cameFromIntro =
        STEP_ORDER[prevWalkthroughStep.current] === "intro";
      setSetupProfilePhase("me");
      if (cameFromIntro) {
        setProfileOpenedInStep1(false);
      }
      setProfileOpen(false);
    } else if (stepChanged && currentStepId === "explore-dashboard") {
      setProfileOpen(false);
      setActiveNav("dashboard");
      setFiltersPanelVisible(true);
      setExplorePhase("filters");
    } else if (stepChanged && currentStepId === "view-opportunities") {
      setProfileOpen(false);
      setActiveNav("dashboard");
      setViewOpportunitiesPhase("card");
      const pickId = pickWalkthroughTourRfpId(feedRfps);
      setTourTargetRfpId(pickId);
      selectRfp(null);
      if (pickId) {
        dispatchWalkthroughFocusRfp(pickId);
      } else {
        setViewOpportunitiesPhase("overview");
      }
    } else if (stepChanged && currentStepId === "completion") {
      setShowCompletion(true);
    } else if (stepChanged && currentStepId !== "completion") {
      setShowCompletion(false);
    }

    prevWalkthroughStep.current = walkthroughStep;
  }, [walkthroughActive, walkthroughStep, setProfileOpen, setFiltersPanelVisible, setActiveNav, feedRfps, selectRfp]);

  // Feed phase needs the main RFP list in the DOM (not History).
  useEffect(() => {
    if (!walkthroughActive) return;
    if (STEP_ORDER[walkthroughStep] !== "explore-dashboard") return;
    if (explorePhase === "feed") {
      setActiveNav("dashboard");
    }
  }, [walkthroughActive, walkthroughStep, explorePhase, setActiveNav]);

  // Step 3 card phase needs the feed list visible.
  useEffect(() => {
    if (!walkthroughActive) return;
    if (STEP_ORDER[walkthroughStep] !== "view-opportunities") return;
    if (viewOpportunitiesPhase === "card") {
      setActiveNav("dashboard");
    }
  }, [walkthroughActive, walkthroughStep, viewOpportunitiesPhase, setActiveNav]);

  // Open Overview tab when step 3 enters the detail phase.
  useEffect(() => {
    if (!walkthroughActive) return;
    if (STEP_ORDER[walkthroughStep] !== "view-opportunities") return;
    if (viewOpportunitiesPhase !== "overview") return;
    window.dispatchEvent(new CustomEvent(WALKTHROUGH_SHOW_DETAIL_OVERVIEW_EVENT));
  }, [walkthroughActive, walkthroughStep, viewOpportunitiesPhase]);

  // Advance step 3 when the user clicks the tour card.
  useEffect(() => {
    if (!walkthroughActive) return;
    if (STEP_ORDER[walkthroughStep] !== "view-opportunities") return;
    if (viewOpportunitiesPhase !== "card") return;
    if (tourTargetRfpId && selectedRfpId === tourTargetRfpId) {
      setCardClickedInStep3(true);
      setViewOpportunitiesPhase("overview");
    }
  }, [
    walkthroughActive,
    walkthroughStep,
    viewOpportunitiesPhase,
    tourTargetRfpId,
    selectedRfpId,
  ]);

  // Advance step 1 when the user opens Me; allow Next after they've opened once.
  useEffect(() => {
    if (!walkthroughActive) return;
    if (STEP_ORDER[walkthroughStep] !== "setup-profile") return;

    if (profileOpen) {
      setProfileOpenedInStep1(true);
      if (setupProfilePhase === "me") {
        setSetupProfilePhase("drawer");
      }
    } else if (!profileOpen && setupProfilePhase === "drawer") {
      setSetupProfilePhase("me");
    }
  }, [
    walkthroughActive,
    walkthroughStep,
    profileOpen,
    setupProfilePhase,
  ]);

  // Resolve spotlight target(s) for the current step / sub-phase.
  useEffect(() => {
    if (!walkthroughActive) return;

    const currentStepId = STEP_ORDER[walkthroughStep];
    const stepContent = WALKTHROUGH_STEPS[currentStepId];

    let selectors: string[] = [];
    if (currentStepId === "setup-profile") {
      // Drawer is already a modal — avoid canvas spotlight/glow on top of it.
      if (setupProfilePhase === "me") {
        selectors = [ME_BUTTON_SELECTOR];
      }
    } else if (currentStepId === "explore-dashboard") {
      return;
    } else if (currentStepId === "view-opportunities") {
      return;
    } else if (stepContent.selector) {
      selectors = [stepContent.selector];
    }

    const delay =
      currentStepId === "setup-profile" && setupProfilePhase === "drawer"
        ? 200
        : 80;

    const resolve = () => {
      setSpotlightRects([]);
      setTargetElements(resolveWalkthroughTargets(selectors));
    };

    const timer = window.setTimeout(resolve, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    walkthroughActive,
    walkthroughStep,
    setupProfilePhase,
    explorePhase,
    filtersPanelVisible,
    feedRfps.length,
  ]);

  // Scroll the active Step 2 highlight into view; re-resolve targets after layout settles.
  useEffect(() => {
    if (!walkthroughActive) return;
    if (STEP_ORDER[walkthroughStep] !== "explore-dashboard") return;

    const phaseConfig = EXPLORE_DASHBOARD_PHASES.find((p) => p.id === explorePhase);
    if (!phaseConfig) return;

    const scrollAndResolve = () => {
      const interact = resolveExploreInteractHole(explorePhase);
      setInteractHole(interact);

      if (explorePhase === "feed") {
        const feedTarget = resolveFeedScrollTarget();
        if (feedTarget) {
          setTargetElements([feedTarget.element]);
          setSpotlightRects([feedTarget.rect]);
        } else {
          setTargetElements([]);
          setSpotlightRects([]);
        }
        return;
      }

      setSpotlightRects([]);
      const target = resolveFirstWalkthroughTarget(phaseConfig.selectors);
      target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setTargetElements(target ? [target] : []);
    };

    const timer = window.setTimeout(scrollAndResolve, 200);
    const interval = window.setInterval(scrollAndResolve, 400);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      setInteractHole({ element: null, rect: null });
    };
  }, [walkthroughActive, walkthroughStep, explorePhase, filtersPanelVisible, feedRfps.length]);

  // Resolve spotlight + interact hole for step 3 part 1 (card).
  useEffect(() => {
    if (!walkthroughActive) return;
    if (STEP_ORDER[walkthroughStep] !== "view-opportunities") return;
    if (viewOpportunitiesPhase !== "card") return;

    const phaseConfig = VIEW_OPPORTUNITIES_PHASES.find((p) => p.id === "card");
    if (!phaseConfig) return;

    const scrollAndResolve = () => {
      const card = resolveFirstWalkthroughTarget(phaseConfig.selectors);
      card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setSpotlightRects([]);
      setTargetElements(card ? [card] : []);
      setInteractHole({ element: card, rect: null });
    };

    const timer = window.setTimeout(scrollAndResolve, 200);
    const interval = window.setInterval(scrollAndResolve, 400);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [
    walkthroughActive,
    walkthroughStep,
    viewOpportunitiesPhase,
    feedRfps.length,
  ]);

  // Step 3 part 2: pin sidebar highlight so tab/content changes do not resize the hole.
  useEffect(() => {
    if (!walkthroughActive) return;
    if (STEP_ORDER[walkthroughStep] !== "view-opportunities") return;
    if (viewOpportunitiesPhase !== "overview") return;

    const applyPinnedSidebarHighlight = (repin: boolean) => {
      const sidebar = resolveDetailSidebarTarget();
      if (!sidebar) {
        setTargetElements([]);
        setSpotlightRects([]);
        setInteractHole({ element: null, rect: null });
        return;
      }

      if (repin || !pinnedDetailSidebarRectRef.current) {
        pinnedDetailSidebarRectRef.current =
          measureDetailSidebarRect(sidebar);
      }

      const rect = pinnedDetailSidebarRectRef.current;
      if (!rect) return;

      setTargetElements([sidebar]);
      setSpotlightRects([rect]);
      setInteractHole({ element: null, rect });
    };

    const pinAfterLayout = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => applyPinnedSidebarHighlight(true));
      });
    };

    const timer = window.setTimeout(pinAfterLayout, 200);
    const onResize = () => applyPinnedSidebarHighlight(true);
    window.addEventListener("resize", onResize);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      pinnedDetailSidebarRectRef.current = null;
      setInteractHole({ element: null, rect: null });
    };
  }, [walkthroughActive, walkthroughStep, viewOpportunitiesPhase]);

  const advanceFromExplorePhase = useCallback(() => {
    if (explorePhase === "filters") {
      setExplorePhase("feed");
      return;
    }
    setWalkthroughStep(walkthroughStep + 1);
  }, [explorePhase, walkthroughStep, setWalkthroughStep]);

  const retreatFromExplorePhase = useCallback(() => {
    if (explorePhase === "feed") {
      setExplorePhase("filters");
      return;
    }
    if (walkthroughStep > 0) {
      setWalkthroughStep(walkthroughStep - 1);
    }
  }, [explorePhase, walkthroughStep, setWalkthroughStep]);

  const handleNext = () => {
    const currentStepId = STEP_ORDER[walkthroughStep];
    if (currentStepId === "explore-dashboard") {
      advanceFromExplorePhase();
      return;
    }
    if (currentStepId === "view-opportunities") {
      if (viewOpportunitiesPhase === "card") {
        if (!cardClickedInStep3) return;
        setCardClickedInStep3(true);
        if (tourTargetRfpId) {
          selectRfp(tourTargetRfpId);
        }
        setViewOpportunitiesPhase("overview");
        return;
      }
      setWalkthroughStep(walkthroughStep + 1);
      return;
    }
    if (currentStepId === "setup-profile" && profileOpen) {
      setProfileOpen(false);
    }
    if (walkthroughStep < STEP_ORDER.length - 1) {
      setWalkthroughStep(walkthroughStep + 1);
    } else if (showCompletion) {
      handleCompletionClick();
    }
  };

  const handlePrev = () => {
    const currentStepId = STEP_ORDER[walkthroughStep];
    if (currentStepId === "explore-dashboard") {
      retreatFromExplorePhase();
      return;
    }
    if (currentStepId === "view-opportunities") {
      if (viewOpportunitiesPhase === "overview") {
        setCardClickedInStep3(true);
        setViewOpportunitiesPhase("card");
        selectRfp(null);
        if (tourTargetRfpId) {
          dispatchWalkthroughFocusRfp(tourTargetRfpId);
        }
        return;
      }
      if (walkthroughStep > 0) {
        setWalkthroughStep(walkthroughStep - 1);
      }
      return;
    }
    if (walkthroughStep > 0) {
      setWalkthroughStep(walkthroughStep - 1);
    }
  };

  const endWalkthroughUi = () => {
    setWalkthroughActive(false);
    setShowCompletion(false);
    setSetupProfilePhase("me");
    setProfileOpenedInStep1(false);
    setExplorePhase("filters");
    setViewOpportunitiesPhase("card");
    setTourTargetRfpId(null);
    setCardClickedInStep3(false);
    pinnedDetailSidebarRectRef.current = null;
    window.dispatchEvent(new CustomEvent(WALKTHROUGH_CLEAR_RFP_FOCUS_EVENT));
    setProfileOpen(false);
  };

  const handleClose = () => {
    captureEvent("walkthrough_dismissed", {
      step_index: walkthroughStep,
      show_completion: showCompletion,
    });
    endWalkthroughUi();
  };

  const handleCompletionClick = () => {
    captureEvent("walkthrough_completed", { step_index: walkthroughStep });
    endWalkthroughUi();
  };

  if (!walkthroughActive) return null;

  const currentStepId = STEP_ORDER[walkthroughStep];
  const stepContent = WALKTHROUGH_STEPS[currentStepId];
  const inSetupProfileStep = currentStepId === "setup-profile";
  /** Bouncing arrow at Me while the profile drawer is closed during step 1. */
  const showMePointer = inSetupProfileStep && !profileOpen;
  /** Next stays disabled until Me has been opened at least once. */
  const needsFirstProfileOpen =
    inSetupProfileStep && !profileOpenedInStep1;
  const profileDrawerTour =
    inSetupProfileStep &&
    setupProfilePhase === "drawer" &&
    profileOpen;

  const explorePhaseContent =
    currentStepId === "explore-dashboard"
      ? EXPLORE_DASHBOARD_PHASES.find((p) => p.id === explorePhase)
      : undefined;

  const viewPhaseContent =
    currentStepId === "view-opportunities"
      ? VIEW_OPPORTUNITIES_PHASES.find((p) => p.id === viewOpportunitiesPhase)
      : undefined;

  const explorePhaseIndex = explorePhaseContent
    ? getExplorePhaseIndex(explorePhaseContent.id)
    : 0;
  const viewPhaseIndex = viewPhaseContent
    ? getViewPhaseIndex(viewPhaseContent.id)
    : 0;
  const effectiveExplorePhaseCount = EXPLORE_DASHBOARD_PHASES.length;
  const effectiveViewPhaseCount = VIEW_OPPORTUNITIES_PHASES.length;
  const exploreHighlightReady =
    currentStepId !== "explore-dashboard" ||
    targetElements.length > 0 ||
    spotlightRects.some((rect) => rect != null);
  const viewHighlightReady =
    currentStepId !== "view-opportunities" ||
    targetElements.length > 0 ||
    spotlightRects.some((rect) => rect != null);

  const tooltipTitle =
    explorePhaseContent?.title ??
    viewPhaseContent?.title ??
    stepContent.title;
  const tooltipDescription = needsFirstProfileOpen
    ? (stepContent.descriptionAwaitingMe ?? stepContent.description)
    : (explorePhaseContent?.description ??
      viewPhaseContent?.description ??
      stepContent.description);
  const needsFirstCardClick =
    currentStepId === "view-opportunities" &&
    viewOpportunitiesPhase === "card" &&
    !cardClickedInStep3;
  const nextDisabled =
    needsFirstProfileOpen ||
    needsFirstCardClick ||
    (currentStepId === "explore-dashboard" && !exploreHighlightReady) ||
    (currentStepId === "view-opportunities" && !viewHighlightReady);
  const phaseProgress =
    currentStepId === "explore-dashboard"
      ? `Part ${Math.min(explorePhaseIndex + 1, effectiveExplorePhaseCount)} of ${effectiveExplorePhaseCount}`
      : currentStepId === "view-opportunities"
        ? `Part ${Math.min(viewPhaseIndex + 1, effectiveViewPhaseCount)} of ${effectiveViewPhaseCount}`
        : undefined;

  const blockBackgroundClicks =
    !showMePointer && (showCompletion || currentStepId !== "completion");
  const inExploreStep = currentStepId === "explore-dashboard";
  const inViewStep = currentStepId === "view-opportunities";
  const exploreInteractReady =
    inExploreStep &&
    exploreHighlightReady &&
    (interactHole.element != null || interactHole.rect != null);
  const viewInteractReady =
    inViewStep &&
    viewHighlightReady &&
    (interactHole.element != null || interactHole.rect != null);
  const useExplorePhaseShield = inExploreStep && exploreInteractReady;
  const useViewPhaseShield = inViewStep && viewInteractReady;

  if (showCompletion) {
    return (
      <>
        <WalkthroughOverlay targetElements={[]} isVisible={true} />
        <div
          className="fixed inset-0 z-[45]"
          aria-hidden
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="pointer-events-auto max-w-md rounded-lg border border-govbid-border bg-govbid-surface p-8 text-center shadow-lg">
            <div className="text-4xl mb-4">✨</div>
            <h2 className="text-2xl font-bold text-govbid-text mb-4">
              Thank you for completing the walkthrough!
            </h2>
            <p className="text-sm text-govbid-text-muted mb-6 leading-relaxed">
              Press Exit below to return to the dashboard.
            </p>
            <button
              onClick={handleCompletionClick}
              className="govbid-btn-primary rounded-lg px-4 py-2.5 text-sm w-full"
            >
              Exit Walkthrough
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <WalkthroughOverlay
        targetElements={profileDrawerTour ? [] : targetElements}
        spotlightRects={profileDrawerTour ? [] : spotlightRects}
        isVisible={true}
      />
      {useExplorePhaseShield || useViewPhaseShield ? (
        <WalkthroughClickShield
          holeElement={interactHole.element}
          holeRect={interactHole.rect}
        />
      ) : blockBackgroundClicks ? (
        <div
          className="fixed inset-0 z-[45]"
          aria-hidden
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        />
      ) : null}
      <WalkthroughMePointer active={showMePointer} />
      <WalkthroughTooltip
        title={tooltipTitle}
        description={tooltipDescription}
        targetElement={targetElements[0] ?? null}
        currentStep={walkthroughStep}
        totalSteps={STEP_ORDER.length}
        onNext={handleNext}
        onPrev={handlePrev}
        onClose={handleClose}
        nextDisabled={nextDisabled}
        phaseProgress={phaseProgress}
        nextHint={
          needsFirstProfileOpen
            ? "Click Me in the header to continue."
            : needsFirstCardClick
              ? "Click the highlighted opportunity to continue."
              : currentStepId === "explore-dashboard" && !exploreHighlightReady
              ? "Loading highlight…"
              : currentStepId === "view-opportunities" && !viewHighlightReady
                ? "Loading highlight…"
              : (currentStepId === "explore-dashboard" &&
                    explorePhase === "filters") ||
                  (currentStepId === "view-opportunities" &&
                    viewOpportunitiesPhase === "card")
                ? "Press Next to see the next area."
                : undefined
        }
      />
    </>
  );
}
