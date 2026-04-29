"use client";

import { startTransition, useEffect, useState } from "react";
import { useDashboard } from "@/context/DashboardContext";

export function ProfileDrawer() {
  const {
    profileOpen,
    setProfileOpen,
    profile,
    savedRfpIds,
    selectRfp,
    saveProfile,
    loadedRfps,
  } = useDashboard();
  const [draftProfile, setDraftProfile] = useState(profile);

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
        <div className="flex items-center justify-between border-b border-govbid-border px-4 py-4">
          <h2 className="text-lg font-bold text-govbid-text">Profile</h2>
          <button
            type="button"
            onClick={() => setProfileOpen(false)}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-govbid-text-muted transition hover:bg-govbid-primary-muted/50 hover:text-govbid-text"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-govbid-text-muted">
              Capabilities
            </h3>
            <label className="block text-xs font-medium text-govbid-text-muted">
              Industries
              <input
                className={fieldClass}
                value={draftProfile.industries}
                onChange={(e) =>
                  setDraftProfile((prev) => ({
                    ...prev,
                    industries: e.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-xs font-medium text-govbid-text-muted">
              Sub-industries
              <input
                className={fieldClass}
                value={draftProfile.subIndustries}
                onChange={(e) =>
                  setDraftProfile((prev) => ({
                    ...prev,
                    subIndustries: e.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-xs font-medium text-govbid-text-muted">
              Goals
              <input
                className={fieldClass}
                value={draftProfile.goals}
                onChange={(e) =>
                  setDraftProfile((prev) => ({
                    ...prev,
                    goals: e.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-xs font-medium text-govbid-text-muted">
              Past experience
              <textarea
                rows={4}
                className={`${fieldClass} resize-y`}
                value={draftProfile.pastExperience}
                onChange={(e) =>
                  setDraftProfile((prev) => ({
                    ...prev,
                    pastExperience: e.target.value,
                  }))
                }
              />
            </label>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => void saveProfile(draftProfile)}
                className="govbid-btn-primary rounded-lg px-4 py-2.5 text-sm"
              >
                Save my information
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
                      className="w-full rounded-xl border border-govbid-border bg-govbid-elevated p-3 text-left text-sm transition hover:border-govbid-border-strong hover:bg-govbid-primary-muted/50"
                    >
                      <span className="line-clamp-2 font-semibold text-govbid-text">
                        {rfp.title}
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
        </div>
      </aside>
    </div>
  );
}
