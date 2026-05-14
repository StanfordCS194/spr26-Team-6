"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import ReactMarkdown from "react-markdown";
import { useDashboard } from "@/context/DashboardContext";
import { isPdfUrl } from "@/lib/pdf";
import type { Rfp } from "@/lib/types";
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
        Loading PDF viewer...
      </p>
    ),
  }
);

/**
 * DetailPanel Variant B - Card-Based Layout
 * 
 * Key differences from Variant A:
 * - Card-based layout with distinct visual sections
 * - Actions are displayed as icon buttons in a sticky header
 * - Horizontal pill tabs instead of underlined tabs
 * - More compact information density
 */
export function DetailPanelVariantB() {
  const { selectedRfp } = useDashboard();

  if (!selectedRfp) {
    return (
      <section className="flex min-h-[220px] flex-1 flex-col items-center justify-center bg-govbid-elevated px-6 py-10 lg:min-h-0">
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
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10,9 9,9 8,9" />
            </svg>
          </div>
          <p className="max-w-[240px] text-center text-sm text-govbid-text-muted">
            Select an opportunity to view details
          </p>
        </div>
      </section>
    );
  }

  return <DetailPanelBodyB key={selectedRfp.id} rfp={selectedRfp} />;
}

type DetailTab = "overview" | "document" | "ai";

function DocumentTabContentB({
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
      <div className="flex min-h-[min(50vh,480px)] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-govbid-border bg-govbid-surface p-6">
        <p className="text-center text-sm leading-relaxed text-govbid-text-muted">
          No documents attached to this RFP.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[min(50vh,480px)] flex-col gap-3">
      {urls.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Attached PDFs">
          {urls.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={idx === i}
              onClick={() => setActivePdfIndex(i)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                idx === i
                  ? "bg-govbid-primary text-white"
                  : "bg-govbid-elevated text-govbid-text-muted hover:bg-govbid-border hover:text-govbid-text"
              }`}
            >
              Document {i + 1}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-end">
        <a
          href={current}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg bg-govbid-primary-muted px-3 py-1.5 text-xs font-semibold text-govbid-primary transition hover:bg-govbid-primary-soft"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15,3 21,3 21,9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Open externally
        </a>
      </div>
      <div className="flex-1 overflow-hidden rounded-xl border border-govbid-border">
        {isPdfUrl(current) ? (
          <RfpPdfViewer key={current} url={current} />
        ) : (
          <SourceDocumentEmbed url={current} title={`RFP source ${idx + 1}`} />
        )}
      </div>
    </div>
  );
}

function DetailPanelBodyB({ rfp }: { rfp: Rfp }) {
  const { toggleSaveRfp, isSaved, showToast, tryLoadCachedSummary } = useDashboard();
  const [tab, setTab] = useState<DetailTab>("overview");
  const [activePdfIndex, setActivePdfIndex] = useState(0);

  useEffect(() => {
    setActivePdfIndex(0);
    // Track variant view
    trackABTestEvent("ab_test_variant_viewed", {
      component: "detail_panel",
      variant: "B",
      rfp_id: rfp.id,
    });
  }, [rfp.id]);

  const saved = isSaved(rfp.id);

  const handleSave = async () => {
    const wasSaved = saved;
    await toggleSaveRfp(rfp.id);
    trackABTestEvent("rfp_action", {
      action: wasSaved ? "unsave" : "save",
      variant: "B",
      rfp_id: rfp.id,
    });
    if (wasSaved) {
      showToast("Removed from saved opportunities.");
    } else {
      showToast("Saved to your profile.");
    }
  };

  const handleSummary = async () => {
    const found = await tryLoadCachedSummary(rfp.id);
    trackABTestEvent("rfp_action", {
      action: "generate_summary",
      variant: "B",
      rfp_id: rfp.id,
      cached: found,
    });
    if (found) {
      showToast("Loaded cached summary from the database.");
      return;
    }
    showToast(
      "No cached summary yet. Generating new summaries requires a server-side pipeline."
    );
  };

  const handleProposal = () => {
    trackABTestEvent("rfp_action", {
      action: "draft_proposal",
      variant: "B",
      rfp_id: rfp.id,
    });
    showToast("Draft proposal feature coming soon.");
  };

  const tabs: { id: DetailTab; label: string; icon: React.ReactNode }[] = [
    {
      id: "overview",
      label: "Overview",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      ),
    },
    {
      id: "document",
      label: "Documents",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14,2 14,8 20,8" />
        </svg>
      ),
    },
    {
      id: "ai",
      label: "AI Analysis",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a10 10 0 1 0 10 10" />
          <path d="M12 12l8-8" />
          <path d="M22 2l-5.5 5.5" />
        </svg>
      ),
    },
  ];

  return (
    <section
      id="detail-panel-b"
      className="flex min-h-0 flex-1 flex-col bg-govbid-elevated"
    >
      {/* Sticky Header with Title and Actions */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-govbid-border bg-govbid-surface px-4 py-3 lg:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              className="text-[10px] font-semibold uppercase tracking-wider text-govbid-primary line-clamp-2"
              title={rfp.agency}
            >
              {shortenAgencyName(rfp.agency, 90)}
            </p>
            <h2 className="mt-0.5 truncate text-base font-bold leading-tight text-govbid-text">
              {rfp.name}
            </h2>
          </div>
          {/* Action Buttons - Icon Style */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleSave}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
                saved
                  ? "border-govbid-primary bg-govbid-primary-muted text-govbid-primary"
                  : "border-govbid-border bg-govbid-surface text-govbid-text-muted hover:border-govbid-border-strong hover:text-govbid-text"
              }`}
              title={saved ? "Remove from saved" : "Save to profile"}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill={saved ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleSummary}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-govbid-primary px-3 text-xs font-semibold text-white transition hover:bg-govbid-primary-hover"
              title="Generate AI summary"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              Summary
            </button>
            <button
              type="button"
              onClick={handleProposal}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-govbid-primary bg-govbid-primary-muted px-3 text-xs font-semibold text-govbid-primary transition hover:bg-govbid-primary-soft"
              title="Draft proposal"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Draft
            </button>
          </div>
        </div>
        
        {/* Pill Tabs */}
        <div className="flex gap-1">
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                trackABTestEvent("tab_switched", {
                  component: "detail_panel",
                  variant: "B",
                  tab: id,
                  rfp_id: rfp.id,
                });
              }}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                tab === id
                  ? "bg-govbid-primary text-white"
                  : "bg-govbid-elevated text-govbid-text-muted hover:bg-govbid-border hover:text-govbid-text"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
        {tab === "overview" && (
          <div className="flex flex-col gap-4">
            {/* Quick Info Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-govbid-border bg-govbid-surface p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-govbid-text-muted">
                  Location
                </p>
                <p className="mt-1 text-sm font-semibold text-govbid-text">
                  {rfp.location}
                </p>
              </div>
              <div className="rounded-xl border border-govbid-border bg-govbid-surface p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-govbid-text-muted">
                  Due Date
                </p>
                <p className="mt-1 text-sm font-semibold text-govbid-text">
                  {rfp.dueDate}
                </p>
              </div>
            </div>

            {/* Tags */}
            {rfp.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {rfp.tags.map((tag) => (
                  <TagBubble key={tag} tag={tag} />
                ))}
              </div>
            )}

            {/* Description Card */}
            <div className="rounded-xl border border-govbid-border bg-govbid-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-govbid-text-muted">
                Description
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-govbid-text">
                {rfp.description}
              </p>
            </div>

            {/* Statement of Work Card */}
            <div className="rounded-xl border border-govbid-border bg-govbid-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-govbid-text-muted">
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

            {/* Deliverables Card */}
            <div className="rounded-xl border border-govbid-border bg-govbid-surface p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-govbid-text-muted">
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
          <DocumentTabContentB
            rfp={rfp}
            activePdfIndex={activePdfIndex}
            setActivePdfIndex={setActivePdfIndex}
          />
        )}

        {tab === "ai" && (
          <div className="rounded-xl border border-govbid-border bg-govbid-surface p-4">
            <div className="prose prose-sm prose-slate max-w-none text-govbid-text">
              <ReactMarkdown>{rfp.aiAnalysisMarkdown}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
