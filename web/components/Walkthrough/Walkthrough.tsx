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
  "view-opportunities": {
    selector: "#detail-panel",
    title: "Step 3: View & Save Opportunities",
    description:
      "Click any RFP to view full details including timeline, requirements, and documents. Use the save button to bookmark opportunities for later review.",
  },
  "completion": {
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

export function Walkthrough() {
  const {
    walkthroughActive,
    setWalkthroughActive,
    walkthroughStep,
    setWalkthroughStep,
    profileOpen,
    setProfileOpen,
    selectedRfpId,
    selectRfp,
    loadedRfps,
  } = useDashboard();

  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const wasWalkthroughActive = useRef(false);

  useEffect(() => {
    if (walkthroughActive && !wasWalkthroughActive.current) {
      captureEvent("walkthrough_started", { step_index: 0 });
    }
    wasWalkthroughActive.current = walkthroughActive;
  }, [walkthroughActive]);

  // Update target element and handle step-specific logic
  useEffect(() => {
    if (!walkthroughActive) return;

    const currentStepId = STEP_ORDER[walkthroughStep];
    const stepContent = WALKTHROUGH_STEPS[currentStepId];

    // Handle specific step transitions and side effects
    if (currentStepId === "setup-profile") {
      setProfileOpen(true);
    } else if (currentStepId === "explore-dashboard") {
      setProfileOpen(false);
    } else if (currentStepId === "completion") {
      setShowCompletion(true);
    }

    // Find and set target element
    if (stepContent.selector) {
      const timer = setTimeout(() => {
        const element = document.querySelector(
          stepContent.selector as string
        ) as HTMLElement | null;
        setTargetElement(element);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setTargetElement(null);
    }
  }, [walkthroughActive, walkthroughStep, setProfileOpen]);

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
    if (walkthroughStep < STEP_ORDER.length - 1) {
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
              Thank you for completing the walkthrough!
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
        totalSteps={STEP_ORDER.length}
        onNext={handleNext}
        onPrev={handlePrev}
        onClose={handleClose}
      />
    </>
  );
}
