"use client";

import { useEffect, useRef, useState } from "react";
import { WalkthroughOverlay } from "./WalkthroughOverlay";
import { WalkthroughTooltip } from "./WalkthroughTooltip";
import { useDashboard } from "@/context/DashboardContext";
import { captureEvent } from "@/lib/analytics";

export type WalkthroughStep =
  | "intro"
  | "profile"
  | "save-profile"
  | "close-profile"
  | "search-bar"
  | "rfp-list"
  | "filter-menu"
  | "open-rfp"
  | "rfp-details"
  | "rfp-title"
  | "rfp-overview"
  | "rfp-sow"
  | "rfp-location"
  | "pdf-viewer"
  | "generate-summary"
  | "save-to-profile"
  | "return-to-profile"
  | "saved-rfp"
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
      "Let's take a walkthrough of how to use this platform to find relevant government contracting opportunities. This interactive tour will guide you through all the key features. Click 'Next' to continue.",
  },
  "profile": {
    selector: "#profile-drawer",
    title: "Your Profile",
    description:
      "This is your profile page. Here you can input relevant information about your company, such as:\n\n• Industries - The sectors your company operates in\n• Sub-industries - More specific industry classifications\n• Goals - Your business objectives\n• Past experience - Previous projects and work history\n\nEnter your information in these text fields.",
  },
  "save-profile": {
    selector: ".profile-save-button",
    title: "Save Your Information",
    description:
      "When you're done typing in your information, click this 'Save my information' button. Your data will be stored and used to personalize your RFP recommendations based on your capabilities and interests. You can update this information at any time.",
  },
  "close-profile": {
    selector: "#profile-drawer",
    title: "Close the Profile",
    description:
      "Now let's close the profile window by clicking the 'Close' button so we can explore the main dashboard. Click 'Next' to continue.",
  },
  "search-bar": {
    selector: "#search-bar",
    title: "Search RFPs",
    description:
      "Use the search bar to look for specific government contracting opportunities. You can type keywords related to:\n\n• Project types\n• Agency names\n• Contract keywords\n• Technical requirements\n\nThe search will filter through all available RFPs to find matches relevant to your query.",
  },
  "rfp-list": {
    selector: "#rfp-feed",
    title: "RFP Recommendations",
    description:
      "This left sidebar displays recommended RFPs specifically curated for you based on your profile. These recommendations are intelligently matched to your company's industries, sub-industries, goals, and past experience.\n\nEach card shows:\n• RFP Title\n• Agency name\n• Contract type\n• Match score indicating relevance\n\nThe higher the match score, the more relevant this opportunity is to your profile.",
  },
  "filter-menu": {
    selector: "#filter-button",
    title: "Filter Your Recommendations",
    description:
      "Use the filter menu to narrow down your RFP recommendations by:\n\n• Tags - Filter by specific categories or keywords\n• Date range - Find opportunities based on due date\n• Contract value - Filter by budget range\n\nThese filters help you focus on opportunities that best match your interests and capabilities.",
  },
  "open-rfp": {
    selector: "#rfp-feed",
    title: "Click on an RFP",
    description:
      "Now click on one of the RFP cards in the list to open it and see the detailed information. This will help us explore the individual RFP details view. Click 'Next' when you've selected an RFP.",
  },
  "rfp-details": {
    selector: "#detail-panel",
    title: "Individual RFP Details",
    description:
      "When you click on an RFP, its full details appear here in the detail panel. This panel shows comprehensive information about the specific opportunity, including all the key details you need to decide whether to pursue it.",
  },
  "rfp-title": {
    selector: ".rfp-title",
    title: "RFP Title",
    description:
      "This is the official title of the Request for Proposal. It typically describes the main project or service being requested by the government agency.",
  },
  "rfp-overview": {
    selector: ".rfp-overview",
    title: "Project Overview",
    description:
      "This section provides a brief summary of the project, including:\n\n• Project goals and objectives\n• General scope of work\n• Context and background\n\nRead this to quickly understand what the agency is looking for.",
  },
  "rfp-sow": {
    selector: ".rfp-sow",
    title: "Statement of Work & Deliverables",
    description:
      "The Statement of Work (SOW) outlines the detailed requirements for completing the project, including:\n\n• Specific tasks and deliverables required\n• Technical specifications\n• Performance requirements\n• Project timeline\n\nThis is a critical section to understand the full scope of what you'd be responsible for and what you must deliver.",
  },
  "rfp-location": {
    selector: ".rfp-location-date",
    title: "Location & Due Date",
    description:
      "This shows:\n\n• Project location - Where the work will be performed or where the agency is located\n• Due date - The deadline for submitting your proposal\n\nMake sure you understand the location requirements and can meet the submission deadline.",
  },
  "pdf-viewer": {
    selector: "[data-walkthrough-tab='document']",
    title: "Source PDF",
    description:
      "Click the 'Source PDF' tab to view the original PDF document from the government agency. Here you can:\n\n• See the complete official RFP document\n• Review official formatting and requirements\n• Scroll through the entire document\n• Access specific sections referenced in the summary\n\nThis is the authoritative source for all requirements.",
  },
  "generate-summary": {
    selector: ".generate-summary-button",
    title: "Generate AI Summary",
    description:
      "Click this button to generate a concise one-page AI summary of the RFP. This summary:\n\n• Condenses the key requirements\n• Highlights critical deadlines and deliverables\n• Extracts essential technical specifications\n• Saves you time reading through lengthy documents\n\nThe summary helps you quickly assess if this opportunity is right for your company.",
  },
  "save-to-profile": {
    selector: ".save-rfp-button",
    title: "Save to Profile",
    description:
      "Click this button to save this RFP to your profile for easy reference later. Saved RFPs:\n\n• Are stored in your profile\n• Can be quickly accessed from your profile page\n• Help you organize opportunities you're interested in\n• Can be unsaved at any time\n\nSaving helps you keep track of opportunities you want to pursue.",
  },
  "return-to-profile": {
    selector: "#profile-drawer",
    title: "Return to Your Profile",
    description:
      "Now let's return to your profile to see the RFP you just saved! You can:\n\n• See all your saved opportunities in one place\n• Click on any saved RFP to open its details\n• Manage your saved opportunities\n• Keep track of promising contracts\n\nYour profile becomes a central hub for managing your top opportunities. Click 'Next' to open the profile.",
  },
  "saved-rfp": {
    selector: ".saved-rfp-item",
    title: "Your Saved RFP",
    description:
      "This is the RFP you just saved to your profile! You can click on it to open the full details again and review all the information. If you decide this opportunity is no longer relevant, you can unsave it from the individual RFP details view by clicking the 'Unsave' button.",
  },
  "completion": {
    selector: null,
    title: "Walkthrough Complete!",
    description:
      "Congratulations! You now know how to:\n\n✓ Set up and maintain your company profile\n✓ Search and filter RFP opportunities\n✓ Review detailed RFP information\n✓ Generate AI summaries of RFPs\n✓ Save and manage your opportunities\n\nYou're ready to start exploring government contracting opportunities!",
  },
};

const STEP_ORDER: WalkthroughStep[] = [
  "intro",
  "profile",
  "save-profile",
  "close-profile",
  "search-bar",
  "rfp-list",
  "filter-menu",
  "open-rfp",
  "rfp-details",
  "rfp-title",
  "rfp-overview",
  "rfp-sow",
  "rfp-location",
  "pdf-viewer",
  "generate-summary",
  "save-to-profile",
  "return-to-profile",
  "saved-rfp",
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
    if (currentStepId === "profile") {
      setProfileOpen(true);
    } else if (currentStepId === "close-profile") {
      // Show instructions but don't auto-close
    } else if (currentStepId === "search-bar") {
      setProfileOpen(false);
    } else if (currentStepId === "open-rfp") {
      // Guide user to click on an RFP
    } else if (currentStepId === "return-to-profile") {
      setProfileOpen(true);
    } else if (currentStepId === "completion") {
      setShowCompletion(true);
    }

    // Find and set target element
    if (stepContent.selector) {
      const timer = setTimeout(() => {
        // Try multiple attempts to find the element
        let element = document.querySelector(
          stepContent.selector as string
        ) as HTMLElement | null;
        
        // If not found and it's a data attribute, try again
        if (!element && (stepContent.selector as string).startsWith("[data-")) {
          element = document.querySelector(
            stepContent.selector as string
          ) as HTMLElement | null;
        }
        
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
