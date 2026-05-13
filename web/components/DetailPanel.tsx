"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import ReactMarkdown from "react-markdown";
import { useDashboard } from "@/context/DashboardContext";
import { captureEvent } from "@/lib/analytics";
import { isPdfUrl } from "@/lib/pdf";
import type { Rfp } from "@/lib/types";
import { SourceDocumentEmbed } from "./SourceDocumentEmbed";
import { TagBubble } from "./RfpCard";
import { trackABTestEvent } from "@/app/posthog-provider";

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

  useEffect(() => {
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
  }, [dueDate]);

  const getColor = () => {
    if (daysLeft <= 0) return "bg-red-50 border-red-200 text-red-700";
    if (daysLeft <= 3) return "bg-red-50 border-red-200 text-red-700";
    if (daysLeft <= 7) return "bg-yellow-50 border-yellow-200 text-yellow-700";
    return "bg-blue-50 border-blue-200 text-blue-700";
  };

  return (
    <div className={`rounded-lg border p-3 ${getColor()}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">Deadline countdown</p>
      <p className="mt-1 text-lg font-bold">
        {daysLeft}d {hoursLeft}h remaining
      </p>
    </div>
  );
}

export function DetailPanel() {
  const { selectedRfp } = useDashboard();

  if (!selectedRfp) {
    return (
      <section className="flex min-h-[220px] flex-1 flex-col items-center justify-center bg-govbid-surface px-6 py-10 lg:min-h-0">
        <p className="max-w-[240px] text-center text-sm text-govbid-text-muted">
          Select an opportunity from the list to view details, run summary stubs, and save to your profile.
        </p>
      </section>
    );
  }

  return <DetailPanelBody key={selectedRfp.id} rfp={selectedRfp} />;
}

type DetailTab = "overview" | "document" | "ai";

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
  const { toggleSaveRfp, isSaved, showToast, tryLoadCachedSummary } =
    useDashboard();
  const [tab, setTab] = useState<DetailTab>("overview");
  const [activePdfIndex, setActivePdfIndex] = useState(0);

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
    captureEvent("rag_summary_requested", { rfp_id: rfp.id });
    const found = await tryLoadCachedSummary(rfp.id);
    trackABTestEvent("rfp_action", {
      action: "generate_summary",
      variant: "A",
      rfp_id: rfp.id,
      cached: found,
    });
    if (found) {
      showToast("Loaded cached summary from the database.");
      captureEvent("rag_summary_cached_hit", { rfp_id: rfp.id });
      return;
    }
    showToast(
      "No cached summary yet. Generating new summaries requires a server-side pipeline (service role) - not available from the browser.",
    );
  };

  const handleProposal = () => {
    trackABTestEvent("rfp_action", {
      action: "draft_proposal",
      variant: "A",
      rfp_id: rfp.id,
    });
    showToast(
      "Draft proposal (stretch) - would use past performance + template generation.",
    );
  };

  const tabs: { id: DetailTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "document", label: "Source PDF" },
    { id: "ai", label: "AI analysis" },
  ];

  return (
    <section id="detail-panel" className="flex min-h-0 flex-1 flex-col bg-govbid-surface">
      <div className="flex shrink-0 gap-8 border-b border-govbid-border px-4 pt-3 lg:px-5">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              captureEvent("detail_tab_changed", { tab: id, rfp_id: rfp.id });
            }}
            data-walkthrough-tab={id}
            className={`pdf-viewer-button relative pb-2.5 text-sm font-semibold transition ${
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

      <div className="flex shrink-0 flex-wrap gap-2 border-b border-govbid-border bg-govbid-elevated px-4 py-3 lg:px-5">
        <button
          type="button"
          onClick={handleSave}
          className="save-rfp-button rounded-lg border border-govbid-border bg-govbid-surface px-3 py-2 text-sm font-medium text-govbid-text transition hover:bg-govbid-primary-muted/40"
        >
          {saved ? "Unsave" : "Save to profile"}
        </button>
        <button
          type="button"
          onClick={handleSummary}
          className="generate-summary-button govbid-btn-primary rounded-lg px-3 py-2 text-sm"
        >
          Generate summary
        </button>
        <button
          type="button"
          onClick={handleProposal}
          className="rounded-lg border border-govbid-border bg-govbid-primary-muted px-3 py-2 text-sm font-semibold text-govbid-primary transition hover:bg-govbid-primary-soft"
        >
          Draft proposal
        </button>
        {saved && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-govbid-border bg-govbid-primary-muted px-3 py-1 text-xs font-semibold text-govbid-primary">
            <span aria-hidden>✓</span> Saved
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
        {tab === "overview" && (
          <div className="mx-auto max-w-2xl space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-govbid-text-muted">
                {rfp.agency}
              </p>
              <h2 className="rfp-title mt-1 text-lg font-bold leading-snug text-govbid-text lg:text-xl">
                {rfp.title}
              </h2>
              <p className="rfp-overview mt-2 text-sm leading-relaxed text-govbid-text-muted">
                {rfp.description}
              </p>
            </div>
            <dl className="rfp-location-date grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-govbid-text-muted">Location</dt>
                <dd className="font-semibold text-govbid-text">{rfp.location}</dd>
              </div>
              <div>
                <dt className="text-govbid-text-muted">Due date</dt>
                <dd className="font-semibold text-govbid-text">{rfp.dueDate}</dd>
              </div>
            </dl>
            
            {/* Deadline Countdown Badge */}
            <DeadlineCountdown dueDate={rfp.dueDate} />
            
            {/* Tags */}
            {rfp.tags?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {rfp.tags.map((tag) => (
                  <TagBubble key={tag} tag={tag} />
                ))}
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
                Statement of work
              </h3>
              <div className="prose prose-sm prose-slate mt-3 max-w-none text-govbid-text">
                <ReactMarkdown>{rfp.sowMarkdown}</ReactMarkdown>
              </div>
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
          <div className="prose prose-sm prose-slate mx-auto max-w-2xl text-govbid-text">
            <ReactMarkdown>{rfp.aiAnalysisMarkdown}</ReactMarkdown>
          </div>
        )}
      </div>
    </section>
  );
}
