"use client";

export function RfpCardSkeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-xl border border-govbid-border bg-govbid-surface p-4 md:p-5">
      <div className="flex gap-4 md:gap-5">
        {/* Date skeleton */}
        <div className="flex shrink-0 flex-col items-center border-r border-govbid-border/80 pr-4 text-center md:pr-5">
          <div className="h-8 w-12 rounded bg-govbid-border md:h-10 md:w-16" />
          <div className="mt-2 h-3 w-8 rounded bg-govbid-border" />
          <div className="mt-2 h-6 w-16 rounded bg-govbid-border" />
        </div>

        {/* Content skeleton */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <div className="h-5 w-3/4 rounded bg-govbid-border md:h-6" />
            <div className="h-4 w-1/2 rounded bg-govbid-border" />
          </div>
          <div className="flex gap-2">
            <div className="h-5 w-12 rounded-full bg-govbid-border" />
            <div className="h-5 w-12 rounded-full bg-govbid-border" />
          </div>
          <div className="flex gap-4 text-xs">
            <div className="h-3 w-24 rounded bg-govbid-border" />
            <div className="h-3 w-24 rounded bg-govbid-border" />
          </div>
        </div>

        {/* Score skeleton */}
        <div className="flex shrink-0 flex-col items-center gap-1">
          <div className="h-9 w-9 rounded-full bg-govbid-border" />
        </div>
      </div>
    </div>
  );
}

export function NotificationSkeleton() {
  return (
    <div className="animate-pulse border-b border-govbid-border p-4">
      <div className="flex gap-3">
        <div className="h-5 w-5 rounded bg-govbid-border" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded bg-govbid-border" />
          <div className="h-3 w-full rounded bg-govbid-border" />
          <div className="h-3 w-1/3 rounded bg-govbid-border" />
        </div>
      </div>
    </div>
  );
}
