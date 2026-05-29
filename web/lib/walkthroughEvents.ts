/** Dispatched before step 2 card phase so the feed resets to page 1. */
export const WALKTHROUGH_FOCUS_CARD_EVENT = "walkthrough-focus-card";

/** Scroll the feed to a specific RFP card during step 3 (detail: `{ rfpId: string }`). */
export const WALKTHROUGH_FOCUS_RFP_EVENT = "walkthrough-focus-rfp";

/** Switch the detail panel to the Overview tab during step 3. */
export const WALKTHROUGH_SHOW_DETAIL_OVERVIEW_EVENT =
  "walkthrough-show-detail-overview";

/** Clear step 3 tour card targeting in the feed. */
export const WALKTHROUGH_CLEAR_RFP_FOCUS_EVENT = "walkthrough-clear-rfp-focus";

/** Index in the tour step order for “Set up your profile” (Capabilities tab). */
export const WALKTHROUGH_SETUP_PROFILE_STEP_INDEX = 1;
