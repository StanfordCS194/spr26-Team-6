"use client";

import { startTransition, useEffect, useState } from "react";
import { useDashboard } from "@/context/DashboardContext";

type ProfileTab = "overview" | "contacts" | "documents";

export function ProfileDrawer() {
  const {
    profileOpen,
    setProfileOpen,
    profile,
    savedRfpIds,
    selectRfp,
    saveProfile,
    loadedRfps,
    setWalkthroughActive,
    setWalkthroughStep,
  } = useDashboard();
  const [draftProfile, setDraftProfile] = useState(profile);
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");

  useEffect(() => {
    if (!profileOpen) return;
    startTransition(() => {
      setDraftProfile(profile);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileOpen, profile, setProfileOpen]);

  const savedRfps = savedRfpIds
    .map((id) => loadedRfps.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r != null);

  if (!profileOpen) return null;

  const fieldClass =
    "mt-1 w-full rounded-lg border border-govbid-border bg-govbid-surface px-3 py-2 text-sm text-govbid-text outline-none transition focus:border-govbid-primary focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-govbid-primary";

  const tabClass = (active: boolean) =>
    `flex-1 border-b-2 px-4 py-3 text-sm font-semibold transition ${
      active
        ? "border-govbid-primary text-govbid-primary"
        : "border-transparent text-govbid-text-muted hover:text-govbid-text"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0"
        style={{ backgroundColor: "var(--govbid-overlay)" }}
        aria-label="Close profile"
        onClick={() => setProfileOpen(false)}
      />
      <aside
        id="profile-drawer"
        className="relative flex h-full w-full max-w-md flex-col border-l border-govbid-border bg-govbid-surface shadow-[var(--govbid-shadow)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-govbid-border px-4 py-4">
          <h2 className="text-lg font-bold text-govbid-text">Company Profile</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setWalkthroughStep(0);
                setWalkthroughActive(true);
                setProfileOpen(false);
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-govbid-text-muted transition hover:text-govbid-text"
              title="Start a walkthrough of the application"
            >
              Help
            </button>
            <button
              type="button"
              onClick={() => setProfileOpen(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-govbid-text-muted transition hover:text-govbid-text"
            >
              Close
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-govbid-border">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={tabClass(activeTab === "overview")}
          >
            Capabilities
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("contacts")}
            className={tabClass(activeTab === "contacts")}
          >
            Contact
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("documents")}
            className={tabClass(activeTab === "documents")}
          >
            Saved ({savedRfps.length})
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* Capabilities Tab */}
          {activeTab === "overview" && (
            <section className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-govbid-text-muted">
                  Build your profile
                </p>
                <p className="mt-1 text-xs text-govbid-text-muted">
                  Complete your company information to get better-matched opportunities.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-govbid-text-muted">
                  Industries you work in
                </label>
                <input
                  className={fieldClass}
                  placeholder="e.g., Technology, Healthcare, Finance"
                  value={draftProfile.industries}
                  onChange={(e) =>
                    setDraftProfile((prev) => ({
                      ...prev,
                      industries: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-govbid-text-muted">
                  Sub-industries
                </label>
                <input
                  className={fieldClass}
                  placeholder="e.g., Cloud Computing, Medical Devices"
                  value={draftProfile.subIndustries}
                  onChange={(e) =>
                    setDraftProfile((prev) => ({
                      ...prev,
                      subIndustries: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-govbid-text-muted">
                  Business goals
                </label>
                <input
                  className={fieldClass}
                  placeholder="e.g., Expand market share, enter federal space"
                  value={draftProfile.goals}
                  onChange={(e) =>
                    setDraftProfile((prev) => ({
                      ...prev,
                      goals: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-govbid-text-muted">
                  Past experience
                </label>
                <textarea
                  rows={4}
                  className={`${fieldClass} resize-y`}
                  placeholder="Describe relevant projects and experience..."
                  value={draftProfile.pastExperience}
                  onChange={(e) =>
                    setDraftProfile((prev) => ({
                      ...prev,
                      pastExperience: e.target.value,
                    }))
                  }
                />
              </div>

              <button
                type="button"
                onClick={() => void saveProfile(draftProfile)}
                className="profile-save-button govbid-btn-primary w-full rounded-lg px-4 py-3 text-sm font-semibold"
              >
                Save information
              </button>
            </div>
          </section>

          <section className="mt-8 border-t border-govbid-border pt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-govbid-text-muted">
              Saved RFPs
            </h3>
            {savedRfps.length === 0 ? (
              <p className="mt-2 text-sm text-govbid-text-muted">
                No saved opportunities yet. Open an RFP and choose &quot;Save to profile&quot;.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {savedRfps.map((rfp) => (
                  <li key={rfp.id}>
                    <button
                      type="button"
                      onClick={() => {
                        selectRfp(rfp.id);
                        setProfileOpen(false);
                      }}
                      className="saved-rfp-item w-full rounded-xl border border-govbid-border bg-govbid-elevated p-3 text-left text-sm transition hover:border-govbid-border-strong hover:bg-govbid-primary-muted/50"
                    >
                      <span className="line-clamp-2 font-semibold text-govbid-text">
                        {rfp.name}
                      </span>
                      <span className="mt-1 block text-xs text-govbid-text-muted">
                        {rfp.agency} · {rfp.contract}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="mt-6 text-xs text-govbid-text-muted">
            Stretch: LinkedIn / company URL ingest would auto-fill these fields via LLM (not implemented).
          </p>
            </section>
          )}

          {/* Contact Tab */}
          {activeTab === "contacts" && (
            <section className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-govbid-text-muted">
                  Contact information
                </p>
                <p className="mt-1 text-xs text-govbid-text-muted">
                  This information helps agencies reach out about opportunities.
                </p>
              </div>

              <div className="rounded-lg border border-govbid-border bg-govbid-elevated p-4">
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-govbid-text-muted">Email</p>
                    <p className="text-sm font-medium text-govbid-text">contact@company.com</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-govbid-text-muted">Phone</p>
                    <p className="text-sm font-medium text-govbid-text">(555) 123-4567</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-govbid-text-muted">Headquarters</p>
                    <p className="text-sm font-medium text-govbid-text">San Francisco, CA</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-govbid-text-muted">SAM.gov ID</p>
                    <p className="text-sm font-medium text-govbid-text">XXXXXX</p>
                  </div>
                </div>
                <button className="mt-4 w-full rounded-lg border border-govbid-border px-3 py-2 text-sm font-medium text-govbid-text transition hover:bg-govbid-primary-muted/40">
                  Edit contact info
                </button>
              </div>
            </section>
          )}

          {/* Saved RFPs Tab */}
          {activeTab === "documents" && (
            <section className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-govbid-text-muted">
                  Your saved opportunities
                </p>
                <p className="mt-1 text-xs text-govbid-text-muted">
                  {savedRfps.length === 0
                    ? "Save RFPs from the detail panel to track them here."
                    : "Click an opportunity to view full details."}
                </p>
              </div>

              {savedRfps.length === 0 ? (
                <div className="rounded-lg border border-dashed border-govbid-border bg-govbid-elevated/50 p-6 text-center">
                  <p className="text-sm text-govbid-text-muted">
                    No saved opportunities yet
                  </p>
                </div>
              ) : (
                <ul className="grid gap-2">
                  {savedRfps.map((rfp) => (
                    <li key={rfp.id}>
                      <button
                        type="button"
                        onClick={() => {
                          selectRfp(rfp.id);
                          setProfileOpen(false);
                        }}
                        className="saved-rfp-item w-full rounded-lg border border-govbid-border bg-govbid-elevated p-3 text-left text-sm transition hover:border-govbid-primary/40 hover:bg-govbid-primary-muted/30"
                      >
                        <span className="line-clamp-2 font-semibold text-govbid-text">
                          {rfp.title}
                        </span>
                        <span className="mt-1 block text-xs text-govbid-text-muted">
                          {rfp.agency}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
