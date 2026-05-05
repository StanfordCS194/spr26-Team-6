"use client";

import Image from "next/image";
import { useDashboard, type ActiveNav } from "@/context/DashboardContext";

function NavIconHome({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={active ? "text-govbid-primary" : "text-govbid-text-muted"}
      aria-hidden
    >
      <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V9.5z" />
    </svg>
  );
}

function NavIconFolder({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={active ? "text-govbid-primary" : "text-govbid-text-muted"}
      aria-hidden
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11z" />
    </svg>
  );
}

function NavIconClock({ active }: { active: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={active ? "text-govbid-primary" : "text-govbid-text-muted"}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6l3 2" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 14h18c0-7-3-7-3-14" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

const navItems: { id: ActiveNav; label: string; icon: typeof NavIconHome }[] = [
  { id: "dashboard", label: "Dashboard", icon: NavIconHome },
  { id: "saved", label: "Saved", icon: NavIconFolder },
  { id: "history", label: "History", icon: NavIconClock },
];

function NavButtons({ className }: { className?: string }) {
  const { activeNav, setActiveNav } = useDashboard();
  return (
    <div className={className} role="navigation" aria-label="Main navigation">
      {navItems.map(({ id, label, icon: Icon }) => {
        const active = activeNav === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setActiveNav(id)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition ${
              active
                ? "text-govbid-primary"
                : "text-govbid-text-muted hover:bg-govbid-primary-muted/50 hover:text-govbid-text"
            }`}
          >
            <Icon active={active} />
            <span
              className={`border-b-2 pb-0.5 ${
                active ? "border-govbid-primary" : "border-transparent"
              }`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function GlobalHeader() {
  const { setProfileOpen, profileOpen, showToast, signOut } = useDashboard();

  return (
    <header className="flex shrink-0 flex-col gap-3 border-b border-govbid-border bg-govbid-surface px-4 py-3 md:px-6">
      <div className="flex w-full min-w-0 items-center gap-3">
        <div className="flex min-w-0 shrink-0 items-center gap-2.5">
          <Image
            src="/govbid-logo.svg"
            alt=""
            width={40}
            height={40}
            className="size-9 shrink-0 rounded-lg md:size-10"
            priority
          />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-base font-bold tracking-tight text-govbid-text md:text-lg">
              GovBid
            </p>
            <p className="truncate text-[10px] font-medium uppercase tracking-wider text-govbid-text-muted md:text-xs">
              Government bids
            </p>
          </div>
        </div>

        <NavButtons className="mx-auto hidden min-w-0 flex-1 flex-wrap items-center justify-center gap-0.5 md:flex lg:gap-1" />

        <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={() => {
              showToast("Create flow — connect to SAM.gov ingest later.");
            }}
            className="govbid-btn-primary flex size-10 items-center justify-center rounded-lg text-lg font-light"
            title="New opportunity"
            aria-label="New opportunity"
          >
            +
          </button>
          <button
            type="button"
            className="relative flex size-10 items-center justify-center rounded-lg text-govbid-text-muted transition hover:bg-govbid-primary-muted/60 hover:text-govbid-text"
            title="Notifications"
            aria-label="Notifications"
          >
            <BellIcon />
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              5
            </span>
          </button>
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            aria-expanded={profileOpen}
            aria-controls="profile-drawer"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-govbid-border bg-govbid-primary-muted text-sm font-semibold text-govbid-primary transition hover:border-govbid-border-strong hover:bg-govbid-primary-soft"
            title="Profile and saved RFPs"
          >
            <span aria-hidden>Me</span>
            <span className="sr-only">Open profile</span>
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-lg border border-govbid-border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-govbid-text-muted transition hover:bg-govbid-primary-muted/50 hover:text-govbid-text"
          >
            Sign out
          </button>
        </div>
      </div>

      <NavButtons className="flex w-full items-center justify-between gap-1 border-t border-govbid-border pt-2 md:hidden" />
    </header>
  );
}
