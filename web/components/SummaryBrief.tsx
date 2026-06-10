"use client";

import ReactMarkdown from "react-markdown";
import { RfpSummarySchema, type RfpSummary } from "@/lib/rfpSummary";

type SummaryBriefProps = {
  content: string | null;
  generating?: boolean;
  emptyMessage: string;
};

function parseSummary(content: string): RfpSummary | null {
  try {
    const parsed = JSON.parse(content);
    const result = RfpSummarySchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function Quote({ quote }: { quote: string }) {
  return (
    <p className="mt-2 border-l-2 border-govbid-border-strong pl-3 text-xs leading-relaxed text-govbid-text-muted">
      {quote}
    </p>
  );
}

function FactList({
  items,
  empty,
}: {
  items: RfpSummary["contract_details"];
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm italic text-govbid-text-muted">{empty}</p>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className="rounded-lg border border-govbid-border bg-govbid-elevated p-3"
        >
          <p className="text-xs font-semibold uppercase text-govbid-text-muted">
            {item.label}
          </p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-govbid-text">
            {item.detail}
          </p>
          <Quote quote={item.citation.quote} />
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-wide text-govbid-text">
        {title}
      </h3>
      {children}
    </section>
  );
}

function StructuredSummary({ summary }: { summary: RfpSummary }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 text-govbid-text">
      <section className="rounded-lg border border-govbid-border bg-govbid-primary-soft p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-govbid-primary">
          Opportunity posture
        </p>
        <p className="mt-2 text-base leading-relaxed">
          {summary.opportunity_posture || "Not stated in the RFP."}
        </p>
        {summary.opportunity_posture_citations.map((citation, index) => (
          <Quote key={index} quote={citation.quote} />
        ))}
      </section>

      <Section title="Scope of Work">
        <div className="rounded-lg border border-govbid-border bg-govbid-surface p-4">
          <p className="text-sm leading-relaxed">
            {summary.scope_of_work || "Not stated in the RFP."}
          </p>
          {summary.scope_of_work_citations.map((citation, index) => (
            <Quote key={index} quote={citation.quote} />
          ))}
        </div>
      </Section>

      <Section title="Technical Work Areas">
        <FactList
          items={summary.technical_work_areas}
          empty="No technical work areas stated in the RFP."
        />
      </Section>

      <Section title="Contract Details">
        <FactList
          items={summary.contract_details}
          empty="No contract details stated in the RFP."
        />
      </Section>

      <Section title="Critical Deadlines">
        {summary.critical_deadlines.length === 0 ? (
          <p className="text-sm italic text-govbid-text-muted">
            No deadlines stated in the RFP.
          </p>
        ) : (
          <div className="space-y-3">
            {summary.critical_deadlines.map((deadline, index) => (
              <div
                key={`${deadline.label}-${index}`}
                className="rounded-lg border border-govbid-border bg-govbid-surface p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-govbid-text">
                    {deadline.label}
                  </p>
                  <p className="text-sm font-bold text-govbid-primary">
                    {deadline.date}
                  </p>
                </div>
                <Quote quote={deadline.citation.quote} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Submission Guidance">
        <FactList
          items={summary.submission_guidance}
          empty="No submission instructions stated in the RFP."
        />
      </Section>

      <Section title="Evaluation Criteria">
        {summary.evaluation_criteria.length === 0 ? (
          <p className="text-sm italic text-govbid-text-muted">
            No evaluation criteria stated in the RFP.
          </p>
        ) : (
          <div className="space-y-3">
            {summary.evaluation_criteria.map((criterion, index) => (
              <div
                key={`${criterion.name}-${index}`}
                className="rounded-lg border border-govbid-border bg-govbid-surface p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-govbid-text">
                    {criterion.name}
                  </p>
                  {typeof criterion.weight_pct === "number" && (
                    <p className="text-xs font-bold text-govbid-primary">
                      {criterion.weight_pct}%
                    </p>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-govbid-text">
                  {criterion.description}
                </p>
                <Quote quote={criterion.citation.quote} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Points of Contact">
        <FactList
          items={summary.points_of_contact}
          empty="No points of contact stated in the RFP."
        />
      </Section>
    </div>
  );
}

export function SummaryBrief({
  content,
  generating = false,
  emptyMessage,
}: SummaryBriefProps) {
  if (!content) {
    return (
      <p className="text-sm italic text-govbid-text-muted">
        {generating ? "Generating summary..." : emptyMessage}
      </p>
    );
  }

  const structured = parseSummary(content);
  if (structured) {
    return <StructuredSummary summary={structured} />;
  }

  return (
    <div className="prose prose-sm prose-slate mx-auto max-w-5xl text-govbid-text">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
