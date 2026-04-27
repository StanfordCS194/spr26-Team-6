"use client";

import { useEffect } from "react";
import { useDashboard } from "@/context/DashboardContext";
import { MOCK_RFPS } from "@/lib/mockData";

export function ProfileDrawer() {
  const {
    profileOpen,
    setProfileOpen,
    profile,
    setProfile,
    savedRfpIds,
    selectRfp,
  } = useDashboard();

  useEffect(() => {
    if (!profileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profileOpen, setProfileOpen]);

  const savedRfps = savedRfpIds
    .map((id) => MOCK_RFPS.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => r != null);

  if (!profileOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close profile"
        onClick={() => setProfileOpen(false)}
      />
      <aside
        id="profile-drawer"
        className="relative flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Profile
          </h2>
          <button
            type="button"
            onClick={() => setProfileOpen(false)}
            className="rounded-lg px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Capabilities
            </h3>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Industries
              <input
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                value={profile.industries}
                onChange={(e) => setProfile({ industries: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Sub-industries
              <input
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                value={profile.subIndustries}
                onChange={(e) => setProfile({ subIndustries: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Goals
              <input
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                value={profile.goals}
                onChange={(e) => setProfile({ goals: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Past experience
              <textarea
                rows={4}
                className="mt-1 w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                value={profile.pastExperience}
                onChange={(e) =>
                  setProfile({ pastExperience: e.target.value })
                }
              />
            </label>
          </section>

          <section className="mt-8">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Saved RFPs
            </h3>
            {savedRfps.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                No saved opportunities yet. Open an RFP and choose &quot;Save
                to profile&quot;.
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
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-left text-sm transition hover:border-emerald-400 dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:border-emerald-500"
                    >
                      <span className="line-clamp-2 font-medium text-zinc-900 dark:text-zinc-50">
                        {rfp.title}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                        {rfp.agency} · {rfp.contract}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="mt-6 text-xs text-zinc-400 dark:text-zinc-500">
            Stretch: LinkedIn / company URL ingest would auto-fill these fields
            via LLM (not implemented).
          </p>
        </div>
      </aside>
    </div>
  );
}
