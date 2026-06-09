"use client";

import { useEffect, useRef, useState } from "react";
import { WalkthroughOverlay } from "./WalkthroughOverlay";
import { WalkthroughTooltip } from "./WalkthroughTooltip";
import { useDashboard } from "@/context/DashboardContext";
import { captureEvent } from "@/lib/analytics";

export type WalkthroughStep =
  | "intro"
  | "setup-profile"
  | "explore-dashboard"
  | "filter-sources"
  | "view-opportunities"
  | "completion";

interface WalkthroughContent {
  selector: string | null;
  title: string;
  description: string;
}

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
    description:
      "Your profile helps us match you with relevant opportunities. Add your company details:\n\n• Industries & sub-industries\n• Business goals\n• Past experience\n\nSaved profiles will personalize your recommendations.",
  },
  "explore-dashboard": {
    selector: "#rfp-feed",
    title: "Step 2: Explore Opportunities",
    description:
      "Your RFP feed shows curated opportunities based on your profile. Use filters to narrow results and search for specific projects. Each card shows the title, agency, and relevance score.",
  },
  "filter-sources": {
    selector: "#source-filter-chips",
    title: "Filter by portal",
    description:
      "Every card is tagged with its source portal — Cal eProcure, BidNet, PlanetBids, or SAM.gov. Use these chips to slice the unified feed by where the RFP was published.",
  },
  "view-opportunities": {
    selector: "#detail-panel",
    title: "Step 3: View & Save Opportunities",
    description:
      "Click any RFP to view full details including timeline, requirements, and documents. Use the save button to bookmark opportunities for later review.",
  },
  completion: {
    selector: null,
    title: "You're Ready!",
    description:
      "You're all set to start exploring government contracts. Remember:\n\n• Update your profile for better recommendations\n• Use filters to find relevant opportunities\n• Save promising RFPs for later review\n\nHappy bidding!",
  },
};

const DEMO_WALKTHROUGH_STEPS: Record<WalkthroughStep, WalkthroughContent> = {
  intro: {
    selector: null,
    title: "One feed. Every portal.",
    description:
      "GovBid pulls live RFPs from Cal eProcure, BidNet, PlanetBids, and SAM.gov into a single searchable dashboard — no more tab-hopping across government sites.\n\nThis quick tour shows the demo flow.",
  },
  "setup-profile": {
    selector: "#source-filter-chips",
    title: "Step 1: Source filters",
    description:
      "Color-coded pills on each card show which portal an opportunity came from. Filter by source to prove we're aggregating real data from multiple procurement systems.",
  },
  "explore-dashboard": {
    selector: "#rfp-feed",
    title: "Step 2: Unified feed",
    description:
      "The header shows total opportunities and a per-source breakdown. Sort by match score to surface the best-fit bids for your contractor profile.",
  },
  "filter-sources": {
    selector: "#source-filter-chips",
    title: "Slice by portal",
    description:
      "Click Cal eProcure, BidNet, or PlanetBids to show only RFPs from that source — then clear back to All sources.",
  },
  "view-opportunities": {
    selector: "#detail-panel",
    title: "Step 3: Match + documents",
    description:
      "Select a high-score RFP to open Match Details (compatibility radar), the source PDF, and one-click AI summary generation — all without leaving GovBid.",
  },
  completion: {
    selector: null,
    title: "Democratizing gov contracting",
    description:
      "GovBid turns fragmented portal chaos into a single pipeline: ingest → score → summarize → bid.\n\nYou're ready to demo. Good luck tomorrow!",
  },
};

const STEP_ORDER: WalkthroughStep[] = [
  "intro",
  "setup-profile",
  "explore-dashboard",
  "filter-sources",
  "view-opportunities",
  "completion",
];

const DEMO_STEP_ORDER: WalkthroughStep[] = [
  "intro",
  "setup-profile",
  "explore-dashboard",
  "view-opportunities",
  "completion",
];

export function Walkthrough() {
  const {
    walkthroughActive,
    setWalkthroughActive,
    walkthroughStep,
    setWalkthroughStep,
    profileOpen,
    setProfileOpen,
    selectRfp,
    loadedRfps,
    demoMode,
  } = useDashboard();

  const stepOrder = demoMode ? DEMO_STEP_ORDER : STEP_ORDER;
  const stepContentMap = demoMode ? DEMO_WALKTHROUGH_STEPS : WALKTHROUGH_STEPS;

  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const wasWalkthroughActive = useRef(false);

  useEffect(() => {
    if (walkthroughActive && !wasWalkthroughActive.current) {
      captureEvent("walkthrough_started", { step_index: 0, demo_mode: demoMode });
    }
    wasWalkthroughActive.current = walkthroughActive;
  }, [walkthroughActive, demoMode]);

  // Update target element and handle step-specific logic
  useEffect(() => {
    if (!walkthroughActive) return;

    const currentStepId = stepOrder[walkthroughStep];
    const stepContent = stepContentMap[currentStepId];

    if (currentStepId === "setup-profile" && !demoMode) {
      setProfileOpen(true);
    } else if (currentStepId === "explore-dashboard") {
      setProfileOpen(false);
    } else if (
      demoMode &&
      currentStepId === "view-opportunities" &&
      loadedRfps.length > 0
    ) {
      const top = [...loadedRfps].sort((a, b) => b.score - a.score)[0];
      if (top) selectRfp(top.id);
    } else if (currentStepId === "completion") {
      setShowCompletion(true);
    }

    if (stepContent.selector) {
      const timer = setTimeout(() => {
        const element = document.querySelector(
          stepContent.selector as string,
        ) as HTMLElement | null;
        setTargetElement(element);
      }, 100);
      return () => clearTimeout(timer);
    }
    setTargetElement(null);
  }, [
    walkthroughActive,
    walkthroughStep,
    setProfileOpen,
    demoMode,
    loadedRfps,
    selectRfp,
    stepOrder,
    stepContentMap,
  ]);

  // Auto-scroll to keep highlighted element visible
  useEffect(() => {
    if (!walkthroughActive || !targetElement || targetElement.offsetParent === null) return;

    const timer = setTimeout(() => {
      const rect = targetElement.getBoundingClientRect();
      const isVisible =
        rect.top >= -200 &&
        rect.left >= -200 &&
        rect.bottom <= window.innerHeight + 200 &&
        rect.right <= window.innerWidth + 200;

      if (!isVisible) {
        targetElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "center",
        });
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [walkthroughActive, targetElement]);

  const handleNext = () => {
    if (walkthroughStep < stepOrder.length - 1) {
      setWalkthroughStep(walkthroughStep + 1);
    } else if (showCompletion) {
      handleCompletionClick();
    }
  };

  const handlePrev = () => {
    if (walkthroughStep > 0) {
      setWalkthroughStep(walkthroughStep - 1);
    }
  };

  const endWalkthroughUi = () => {
    setWalkthroughActive(false);
    setShowCompletion(false);
    setProfileOpen(false);
  };

  const handleClose = () => {
    captureEvent("walkthrough_dismissed", {
      step_index: walkthroughStep,
      show_completion: showCompletion,
      demo_mode: demoMode,
    });
    endWalkthroughUi();
  };

  const handleCompletionClick = () => {
    captureEvent("walkthrough_completed", {
      step_index: walkthroughStep,
      demo_mode: demoMode,
    });
    endWalkthroughUi();
  };

  if (!walkthroughActive) return null;

  const currentStepId = stepOrder[walkthroughStep];
  const stepContent = stepContentMap[currentStepId];

  if (showCompletion) {
    return (
      <>
        <WalkthroughOverlay
          targetElement={null}
          isVisible={true}
        />
        <div
          className="fixed inset-0 z-50 flex items-center justify-center cursor-pointer"
          onClick={handleCompletionClick}
        >
          <div className="max-w-md rounded-lg border border-govbid-border bg-govbid-surface p-8 text-center shadow-lg">
            <div className="text-4xl mb-4">✨</div>
            <h2 className="text-2xl font-bold text-govbid-text mb-4">
              {demoMode
                ? "Demo tour complete"
                : "Thank you for completing the walkthrough!"}
            </h2>
            <p className="text-sm text-govbid-text-muted mb-6 leading-relaxed">
              Click anywhere or press any key to exit the walkthrough.
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
      <WalkthroughOverlay targetElement={targetElement} isVisible={true} />
      <WalkthroughTooltip
        title={stepContent.title}
        description={stepContent.description}
        targetElement={targetElement}
        currentStep={walkthroughStep}
        totalSteps={stepOrder.length}
        onNext={handleNext}
        onPrev={handlePrev}
        onClose={handleClose}
      />
    </>
  );
}
