"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import ReactMarkdown from "react-markdown";
import { useDashboard } from "@/context/DashboardContext";
import { captureEvent } from "@/lib/analytics";
import { isPdfUrl } from "@/lib/pdf";
import type { CompatibilityFactors, Rfp } from "@/lib/types";
import { RadarChart } from "./RadarChart";
import { SourceDocumentEmbed } from "./SourceDocumentEmbed";
import { TagBubble } from "./RfpCard";
import { trackABTestEvent } from "@/app/posthog-provider";
import { shortenAgencyName } from "@/lib/formatAgency";

const RfpPdfViewer = dynamic(
  () => import("./RfpPdfViewer").then((m) => m.RfpPdfViewer),
  {
    ssr: false,
    loading: () => (
      <p className="py-8 text-center text-sm text-govbid-text-muted">
        Loading PDF viewer…
      </p>
    ),
  },
);

function DeadlineCountdown({ dueDate }: { dueDate: string }) {
  const [daysLeft, setDaysLeft] = useState(0);
  const [hoursLeft, setHoursLeft] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const updateCountdown = () => {
      const deadline = new Date(`${dueDate}T23:59:59`);
      const now = new Date();
      const diff = deadline.getTime() - now.getTime();
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      
      setDaysLeft(Math.max(0, days));
      setHoursLeft(Math.max(0, hours));
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 3600000); // Update every hour
    return () => clearInterval(timer);
  }, [dueDate, mounted]);

  const getColor = () => {
    if (daysLeft <= 0) return "bg-red-50 border-red-200 text-red-700";
    if (daysLeft <= 3) return "bg-red-50 border-red-200 text-red-700";
    if (daysLeft <= 7) return "bg-yellow-50 border-yellow-200 text-yellow-700";
    return "bg-blue-50 border-blue-200 text-blue-700";
  };

  return (
    <div
      className={`flex h-full flex-col justify-center rounded-xl border px-4 py-3 ${
        mounted ? getColor() : "border-govbid-border bg-govbid-surface"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
        Time remaining
      </p>
      <p className="mt-0.5 text-base font-bold tabular-nums" suppressHydrationWarning>
        {mounted ? `${daysLeft}d ${hoursLeft}h` : "—"}
      </p>
    </div>
  );
}

export function DetailPanel() {
  const { selectedRfp } = useDashboard();

  if (!selectedRfp) {
    return (
      <section className="flex min-h-[220px] flex-1 flex-col items-center justify-center border-l border-govbid-border/80 bg-govbid-elevated px-6 py-10 lg:min-h-0">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-govbid-primary-muted">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-govbid-primary"
              aria-hidden
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
          <p className="max-w-[260px] text-center text-sm leading-relaxed text-govbid-text-muted">
            Select an opportunity from the list to view details, run summary stubs, and save to your profile.
          </p>
        </div>
      </section>
    );
  }

  return <DetailPanelBody key={selectedRfp.id} rfp={selectedRfp} />;
}

type DetailTab = "overview" | "document" | "ai" | "summary" | "match";

const FACTOR_DISPLAY: { key: keyof CompatibilityFactors; label: string; max: number }[] = [
  { key: "timing", label: "Timing", max: 1 },
  { key: "experience", label: "Experience", max: 100 },
  { key: "goals", label: "Goals", max: 100 },
  { key: "prereqs", label: "Pre-reqs", max: 100 },
  { key: "geography", label: "Geography", max: 100 },
  { key: "agency", label: "Agency", max: 100 },
  { key: "keywords", label: "Keywords", max: 100 },
];

function DocumentTabContent({
  rfp,
  activePdfIndex,
  setActivePdfIndex,
}: {
  rfp: Rfp;
  activePdfIndex: number;
  setActivePdfIndex: Dispatch<SetStateAction<number>>;
}) {
  const urls = rfp.pdfUrls;
  const idx = urls.length
    ? Math.min(Math.max(0, activePdfIndex), urls.length - 1)
    : 0;
  const current = urls[idx] ?? "";

  if (urls.length === 0) {
    return (
      <div className="mx-auto flex min-h-[min(50vh,480px)] max-w-3xl flex-col gap-3">
        <p className="text-center text-sm leading-relaxed text-govbid-text-muted">
          No PDF URLs on this RFP. Populate{" "}
          <code className="rounded bg-govbid-primary-muted/50 px-1">pdf_url_1</code>{" "}
          through{" "}
          <code className="rounded bg-govbid-primary-muted/50 px-1">pdf_url_10</code>{" "}
          in Supabase (non-empty strings are shown in order).
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[min(50vh,480px)] max-w-3xl flex-col gap-3">
      {urls.length > 1 && (
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Attached PDFs"
        >
          {urls.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={idx === i}
              onClick={() => setActivePdfIndex(i)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                idx === i
                  ? "border-govbid-primary bg-govbid-primary-muted text-govbid-primary"
                  : "border-govbid-border bg-govbid-surface text-govbid-text-muted hover:border-govbid-border-strong hover:text-govbid-text"
              }`}
            >
              PDF {i + 1}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-govbid-text-muted">
          {isPdfUrl(current)
            ? "In-app PDF viewer (CORS permitting). On failure we can fall back to a browser embed."
            : "Embedded page or viewer link. If the frame is blank, the site may block iframes — use Open in new tab."}
        </p>
        <a
          href={current}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-govbid-primary underline"
        >
          Open in new tab
        </a>
      </div>
      {isPdfUrl(current) ? (
        <RfpPdfViewer key={current} url={current} />
      ) : (
        <SourceDocumentEmbed url={current} title={`RFP source ${idx + 1}`} />
      )}
    </div>
  );
}

function DetailPanelBody({ rfp }: { rfp: Rfp }) {
  const {
    toggleSaveRfp,
    isSaved,
    showToast,
    loadOrGenerateSummary,
    isGeneratingSummary,
    getMatchFactors,
    isScoring,
    ensureScored,
  } = useDashboard();
  const [tab, setTab] = useState<DetailTab>("overview");
  const [activePdfIndex, setActivePdfIndex] = useState(0);
  const generating = isGeneratingSummary(rfp.id);
  const matchFactors = getMatchFactors(rfp.id);
  const matchScoring = isScoring(rfp.id);

  // When the Match Details tab is opened and there is no cached breakdown,
  // kick off scoring so the radar can populate.
  useEffect(() => {
    if (tab !== "match") return;
    if (matchFactors || matchScoring) return;
    void ensureScored(rfp.id);
  }, [tab, matchFactors, matchScoring, ensureScored, rfp.id]);

  useEffect(() => {
    setActivePdfIndex(0);
    // Track variant view
    trackABTestEvent("ab_test_variant_viewed", {
      component: "detail_panel",
      variant: "A",
      rfp_id: rfp.id,
    });
  }, [rfp.id]);

  const saved = isSaved(rfp.id);

  const handleSave = async () => {
    const wasSaved = saved;
    await toggleSaveRfp(rfp.id);
    trackABTestEvent("rfp_action", {
      action: wasSaved ? "unsave" : "save",
      variant: "A",
      rfp_id: rfp.id,
    });
    if (wasSaved) {
      showToast("Removed from saved opportunities.");
    } else {
      showToast("Saved to your profile.");
    }
  };

  const handleSummary = async () => {
    if (generating) return;
    captureEvent("rag_summary_requested", { rfp_id: rfp.id });
    showToast("Generating summary");
    const result = await loadOrGenerateSummary(rfp.id);
    trackABTestEvent("rfp_action", {
      action: "generate_summary",
      variant: "A",
      rfp_id: rfp.id,
      cached: result === "cached",
    });
    if (result === "cached") {
      showToast("Loaded cached summary. See the Summary tab.");
      captureEvent("rag_summary_cached_hit", { rfp_id: rfp.id });
      setTab("summary");
      return;
    }
    if (result === "generated") {
      showToast("Summary generated. See the Summary tab.");
      captureEvent("rag_summary_generated", { rfp_id: rfp.id });
      setTab("summary");
      return;
    }
  };

  const tabs: { id: DetailTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "document", label: "Source PDF" },
    { id: "summary", label: "Summary" },
    { id: "ai", label: "AI analysis" },
    { id: "match", label: "Match Details" },
  ];

  return (
    <section id="detail-panel" className="flex min-h-0 flex-1 flex-col bg-govbid-surface">
      <div className="shrink-0 border-b border-govbid-border bg-govbid-elevated/50 px-4 py-3 lg:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="rfp-title line-clamp-2 text-base font-bold leading-snug text-govbid-text lg:text-lg">
              {rfp.title}
            </h2>
            <p
              className="mt-0.5 line-clamp-1 text-xs font-medium text-govbid-text-muted"
              title={rfp.agency}
            >
              {shortenAgencyName(rfp.agency, 96)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="save-rfp-button rounded-lg border border-govbid-border bg-govbid-surface px-3 py-1.5 text-sm font-medium text-govbid-text transition hover:bg-govbid-primary-muted/40"
            >
              {saved ? "Unsave" : "Save to profile"}
            </button>
            <button
              type="button"
              onClick={handleSummary}
              disabled={generating}
              className="generate-summary-button govbid-btn-primary rounded-lg px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? "Generating…" : "Generate summary"}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 rounded-full border border-govbid-border bg-govbid-primary-muted px-2.5 py-1 text-xs font-semibold text-govbid-primary">
                <span aria-hidden>✓</span> Saved
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 overflow-x-auto border-b border-govbid-border">
        <div className="flex min-w-max gap-5 px-4 pt-2.5 lg:gap-6 lg:px-5">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                captureEvent("detail_tab_changed", { tab: id, rfp_id: rfp.id });
              }}
              data-walkthrough-tab={id}
              className={`pdf-viewer-button relative shrink-0 pb-2.5 text-sm font-semibold transition ${
                tab === id
                  ? "text-govbid-text"
                  : "text-govbid-text-muted hover:text-govbid-text"
              }`}
            >
              {label}
              {tab === id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-govbid-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
        {tab === "overview" && (
          <div className="mx-auto w-full max-w-5xl space-y-5">
            <div className="space-y-3">
              <div className="rounded-xl border border-govbid-border/80 bg-govbid-elevated/60 p-4 lg:p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-govbid-text-muted">
                  Overview
                </p>
                <p className="rfp-overview mt-2 text-base leading-relaxed text-govbid-text lg:text-[1.05rem] lg:leading-7">
                  {rfp.description}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-govbid-text-muted">
                Key details
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-govbid-border bg-govbid-surface px-4 py-3">
                  <p className="text-xs font-medium text-govbid-text-muted">Location</p>
                  <p className="rfp-location mt-0.5 text-sm font-semibold text-govbid-text">
                    {rfp.location}
                  </p>
                </div>
                <div className="rounded-xl border border-govbid-border bg-govbid-surface px-4 py-3">
                  <p className="text-xs font-medium text-govbid-text-muted">Due date</p>
                  <p className="rfp-due-date mt-0.5 text-sm font-semibold text-govbid-text">
                    {rfp.dueDate}
                  </p>
                </div>
                <DeadlineCountdown dueDate={rfp.dueDate} />
              </div>
            </div>

            {rfp.tags?.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-govbid-text-muted">
                  Tags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {rfp.tags.map((tag) => (
                    <TagBubble key={tag} tag={tag} />
                  ))}
                </div>
              </div>
            )}
            
            {/* Eligibility Requirements */}
            <div className="rounded-xl border border-govbid-border bg-govbid-elevated p-4">
              <h3 className="text-sm font-semibold text-govbid-text">
                Eligibility Requirements
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-govbid-text">
                <li className="flex gap-2">
                  <span className="shrink-0 text-govbid-primary">✓</span>
                  <span>Valid SAM registration required</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 text-govbid-primary">✓</span>
                  <span>Contractor with relevant experience preferred</span>
                </li>
                <li className="flex gap-2">
                  <span className="shrink-0 text-govbid-primary">✓</span>
                  <span>Certified small business status (if applicable)</span>
                </li>
              </ul>
            </div>
            
            <div className="rfp-sow rounded-xl border border-govbid-border bg-govbid-surface p-4">
              <h3 className="text-sm font-semibold text-govbid-text">
                Statement of Work
              </h3>
              {rfp.statementOfWork ? (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-govbid-text">
                  {rfp.statementOfWork}
                </p>
              ) : (
                <p className="mt-3 text-sm italic text-govbid-text-muted">
                  No statement of work available for this RFP.
                </p>
              )}
            </div>
            <div className="rfp-deliverables rounded-xl border border-govbid-border bg-govbid-surface p-4">
              <h3 className="text-sm font-semibold text-govbid-text">
                Deliverables
              </h3>
              {rfp.deliverables.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-govbid-text">
                  {rfp.deliverables.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm italic text-govbid-text-muted">
                  No deliverables listed for this RFP.
                </p>
              )}
            </div>
          </div>
        )}

        {tab === "document" && (
          <DocumentTabContent
            rfp={rfp}
            activePdfIndex={activePdfIndex}
            setActivePdfIndex={setActivePdfIndex}
          />
        )}

        {tab === "ai" && (
          <div className="prose prose-sm prose-slate mx-auto max-w-5xl text-govbid-text">
            <ReactMarkdown>{rfp.aiAnalysisMarkdown}</ReactMarkdown>
          </div>
        )}

        {tab === "summary" && (
          <div className="prose prose-sm prose-slate mx-auto max-w-5xl text-govbid-text">
            {rfp.summaryMarkdown ? (
              <ReactMarkdown>{rfp.summaryMarkdown}</ReactMarkdown>
            ) : (
              <p className="text-sm italic text-govbid-text-muted">
                {generating
                  ? "Generating summary…"
                  : "No summary yet. Click \"Generate summary\" above to extract scope of work, deadlines, and evaluation criteria from the RFP text."}
              </p>
            )}
          </div>
        )}

        {tab === "match" && (
          <MatchDetailsTab
            rfp={rfp}
            factors={matchFactors}
            scoring={matchScoring}
          />
        )}
      </div>
    </section>
  );
}

function MatchDetailsTab({
  rfp,
  factors,
  scoring,
}: {
  rfp: Rfp;
  factors: { factors: CompatibilityFactors; total: number } | null;
  scoring: boolean;
}) {
  if (!factors) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center">
        <p className="text-sm text-govbid-text-muted">
          {scoring
            ? "Computing your compatibility breakdown…"
            : "No match breakdown yet. Open this RFP or wait for the background scorer to finish."}
        </p>
      </div>
    );
  }

  const radarData = FACTOR_DISPLAY.map(({ key, label, max }) => ({
    label,
    value: Number(factors.factors[key]?.score ?? 0),
    max,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold text-govbid-text">
          Match breakdown
        </h2>
        <p className="text-sm text-govbid-text-muted">
          Overall:{" "}
          <span className="font-semibold text-govbid-text">
            {Math.round(factors.total)}/100
          </span>
        </p>
      </div>

      <div className="rounded-xl border border-govbid-border bg-govbid-surface p-4">
        <RadarChart data={radarData} size={420} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {FACTOR_DISPLAY.map(({ key, label, max }) => {
          const f = factors.factors[key];
          if (!f) return null;
          const ratio =
            max > 0 ? Math.min(1, Math.max(0, f.score / max)) : 0;
          return (
            <div
              key={key}
              className="rounded-lg border border-govbid-border bg-govbid-elevated p-3"
            >
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-govbid-text-muted">
                <span>{label}</span>
                <span>
                  {max <= 1
                    ? f.score.toFixed(1).replace(/\.0$/, "")
                    : Math.round(f.score)}
                  {" / "}
                  {max <= 1 ? max : max}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-govbid-border">
                <div
                  className="h-full rounded-full bg-govbid-primary"
                  style={{ width: `${(ratio * 100).toFixed(0)}%` }}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-govbid-text">
                {f.reason}
              </p>
            </div>
          );
        })}
      </div>
      {/* Track id so unused parameter warnings stay quiet */}
      <span className="sr-only">RFP {rfp.id}</span>
    </div>
  );
}
