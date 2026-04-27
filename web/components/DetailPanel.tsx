"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { useDashboard } from "@/context/DashboardContext";
import type { Rfp } from "@/lib/types";

export function DetailPanel() {
  const { selectedRfp } = useDashboard();

  if (!selectedRfp) {
    return (
      <section className="flex flex-1 items-center justify-center bg-zinc-50/50 p-8 dark:bg-zinc-900/30">
        <p className="max-w-sm text-center text-sm text-zinc-500 dark:text-zinc-400">
          Select a recommended RFP from the sidebar to see details, run a
          summary (stub), or save it to your profile.
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
    if (saved) {
      showToast("Already in your saved list — use profile to review.");
      return;
    }
    toggleSaveRfp(rfp.id);
    showToast("Saved to your profile.");
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
    <section className="flex min-h-0 flex-1 flex-col bg-zinc-50/30 dark:bg-zinc-900/20">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setTab("overview")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            tab === "overview"
              ? "bg-emerald-600 text-white dark:bg-emerald-500"
              : "text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setTab("ai")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            tab === "ai"
              ? "bg-emerald-600 text-white dark:bg-emerald-500"
              : "text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          AI analysis
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          {saved ? "Saved" : "Save to profile"}
        </button>
        <button
          type="button"
          onClick={handleSummary}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        >
          Generate summary
        </button>
        <button
          type="button"
          onClick={handleProposal}
          className="rounded-lg bg-emerald-700/90 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600"
        >
          Draft proposal
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "overview" ? (
          <div className="mx-auto max-w-3xl space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {rfp.agency}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                {rfp.title}
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                {rfp.description}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">Location</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                  {rfp.location}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">Due date</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                  {rfp.dueDate}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">Value</dt>
                <dd className="font-medium text-zinc-900 dark:text-zinc-100">
                  {rfp.contract}
                </dd>
              </div>
            </dl>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Statement of work (markdown stub)
              </h3>
              <div className="prose prose-sm prose-zinc mt-3 max-w-none dark:prose-invert">
                <ReactMarkdown>{rfp.sowMarkdown}</ReactMarkdown>
              </div>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm prose-zinc mx-auto max-w-3xl dark:prose-invert">
            <ReactMarkdown>{rfp.aiAnalysisMarkdown}</ReactMarkdown>
          </div>
        )}
      </div>
    </section>
  );
}
