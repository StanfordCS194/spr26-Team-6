"use client";

import { useDashboard } from "@/context/DashboardContext";

export function GlobalHeader() {
  const { searchQuery, setSearchQuery, setProfileOpen, profileOpen } =
    useDashboard();

  return (
    <header className="flex shrink-0 flex-col gap-2 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 lg:flex-row lg:items-center lg:gap-4 lg:py-0 lg:h-14">
      <h1 className="shrink-0 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Client dashboard
      </h1>
      <div className="min-w-0 flex-1 lg:max-w-xl">
        <label htmlFor="global-search" className="sr-only">
          Search RFPs
        </label>
        <input
          id="global-search"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search title, agency, tags…"
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none ring-emerald-500/0 transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
      <button
        type="button"
        onClick={() => setProfileOpen(!profileOpen)}
        aria-expanded={profileOpen}
        aria-controls="profile-drawer"
        className="flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-full border border-zinc-200 bg-zinc-50 text-lg transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 lg:self-center"
        title="Profile and saved RFPs"
      >
        <span aria-hidden>👤</span>
      </button>
    </header>
  );
}
