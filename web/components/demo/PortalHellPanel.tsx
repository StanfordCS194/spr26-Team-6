"use client";

const PORTALS = [
  {
    name: "Cal eProcure",
    subtitle: "State of California",
    pain: "47 tabs · PDF-only attachments",
    accent: "border-blue-300 bg-blue-50/80",
  },
  {
    name: "BidNet Direct",
    subtitle: "Regional aggregator",
    pain: "Login walls · stale listings",
    accent: "border-orange-300 bg-orange-50/80",
  },
  {
    name: "PlanetBids",
    subtitle: "Municipal portals",
    pain: "Different UI per agency",
    accent: "border-emerald-300 bg-emerald-50/80",
  },
  {
    name: "SAM.gov",
    subtitle: "Federal registry",
    pain: "10 req/day · metadata-only bulk",
    accent: "border-slate-300 bg-slate-50/80",
  },
] as const;

export function PortalHellPanel() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#1a1d24] text-white">
      <div className="border-b border-white/10 px-4 py-3 md:px-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">
          Before GovBid
        </p>
        <h2 className="mt-1 text-lg font-bold leading-snug">
          Four portals. Zero unified view.
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-white/60">
          A BD analyst opens each site daily, downloads PDFs manually, and still
          misses opportunities buried in addenda.
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 md:p-5">
        {PORTALS.map((p) => (
          <div
            key={p.name}
            className={`rounded-xl border-2 border-dashed p-4 ${p.accent}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-900">{p.name}</p>
                <p className="text-[11px] text-slate-600">{p.subtitle}</p>
              </div>
              <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                Open
              </span>
            </div>
            <div className="mt-3 space-y-1.5 rounded-lg bg-white/70 p-2.5">
              <div className="h-2 w-full rounded bg-slate-200" />
              <div className="h-2 w-4/5 rounded bg-slate-200" />
              <div className="h-2 w-3/5 rounded bg-slate-200" />
            </div>
            <p className="mt-2 text-[11px] font-medium text-slate-700">{p.pain}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-4 py-3 text-center md:px-5">
        <p className="text-xs font-semibold text-amber-300">
          ~45 min/day before evaluating a single bid
        </p>
      </div>
    </div>
  );
}
