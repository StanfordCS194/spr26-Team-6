"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { useDashboard } from "@/context/DashboardContext";
import type { Rfp } from "@/lib/types";

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

function DetailPanelBody({ rfp }: { rfp: Rfp }) {
  const { toggleSaveRfp, isSaved, showToast } = useDashboard();
  const [tab, setTab] = useState<"overview" | "ai">("overview");

  const saved = isSaved(rfp.id);

  const handleSave = () => {
    toggleSaveRfp(rfp.id);
    if (saved) {
      showToast("Removed from saved opportunities.");
    } else {
      showToast("Saved to your profile.");
    }
  };

  const handleSummary = () => {
    showToast(`Summary pipeline stub — would call RAG for RFP #${rfp.id}.`);
  };

  const handleProposal = () => {
    showToast(
      "Draft proposal (stretch) — would use past performance + template generation.",
    );
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-govbid-surface">
      <div className="flex shrink-0 gap-8 border-b border-govbid-border px-4 pt-3 lg:px-5">
        {(["overview", "ai"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`relative pb-2.5 text-sm font-semibold transition ${
              tab === id
                ? "text-govbid-text"
                : "text-govbid-text-muted hover:text-govbid-text"
            }`}
          >
            {id === "overview" ? "Overview" : "AI analysis"}
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
          className="rounded-lg border border-govbid-border bg-govbid-surface px-3 py-2 text-sm font-medium text-govbid-text transition hover:bg-govbid-primary-muted/40"
        >
          {saved ? "Unsave" : "Save to profile"}
        </button>
        <button
          type="button"
          onClick={handleSummary}
          className="govbid-btn-primary rounded-lg px-3 py-2 text-sm"
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
        {tab === "overview" ? (
          <div className="mx-auto max-w-2xl space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-govbid-text-muted">
                {rfp.agency}
              </p>
              <h2 className="mt-1 text-lg font-bold leading-snug text-govbid-text lg:text-xl">
                {rfp.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-govbid-text-muted">
                {rfp.description}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-govbid-text-muted">Location</dt>
                <dd className="font-semibold text-govbid-text">{rfp.location}</dd>
              </div>
              <div>
                <dt className="text-govbid-text-muted">Due date</dt>
                <dd className="font-semibold text-govbid-text">{rfp.dueDate}</dd>
              </div>
              <div>
                <dt className="text-govbid-text-muted">Value</dt>
                <dd className="text-lg font-bold tabular-nums text-govbid-primary">{rfp.contract}</dd>
              </div>
            </dl>
            <div className="rounded-xl border border-govbid-border bg-govbid-surface p-4">
              <h3 className="text-sm font-semibold text-govbid-text">
                Statement of work (markdown stub)
              </h3>
              <div className="prose prose-sm prose-slate mt-3 max-w-none text-govbid-text">
                <ReactMarkdown>{rfp.sowMarkdown}</ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm prose-slate mx-auto max-w-2xl text-govbid-text">
            <ReactMarkdown>{rfp.aiAnalysisMarkdown}</ReactMarkdown>
          </div>
        )}
      </div>
    </section>
  );
}
