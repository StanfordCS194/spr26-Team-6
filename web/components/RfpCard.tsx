"use client";

import type { Rfp } from "@/lib/types";
import { ScoreRing } from "./ScoreRing";

type Props = {
  rfp: Rfp;
  active: boolean;
  onSelect: () => void;
};

const tagColors = [
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
];

export function RfpCard({ rfp, active, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full gap-3 rounded-xl border p-3 text-left transition hover:border-zinc-400 dark:hover:border-zinc-500 ${
        active
          ? "border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-500/30 dark:bg-emerald-950/40 dark:border-emerald-400"
          : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/60"
      }`}
    >
      <ScoreRing score={rfp.score} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {rfp.agency}
        </p>
        <h3 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
          {rfp.title}
        </h3>
        <div className="mt-2 flex flex-wrap gap-1">
          {rfp.tags.slice(0, 4).map((tag, i) => (
            <span
              key={tag}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${tagColors[i % tagColors.length]}`}
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
          <span>Due {rfp.dueDate}</span>
          <span className="font-medium text-zinc-800 dark:text-zinc-200">
            {rfp.contract}
          </span>
        </div>
      </div>
    </button>
  );
}
