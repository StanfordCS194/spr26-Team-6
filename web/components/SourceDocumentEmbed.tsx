"use client";

import { toGoogleDrivePreviewUrl } from "@/lib/pdf";

type Props = {
  url: string;
  title?: string;
};

/**
 * Embeds a URL in an iframe (HTML portals, viewer links, or PDFs the host
 * serves without CORS for pdf.js). Many sites block framing; then the area
 * stays blank and users should open the link in a new tab.
 */
export function SourceDocumentEmbed({ url, title = "Source document" }: Props) {
  const previewUrl = toGoogleDrivePreviewUrl(url);
  const src = previewUrl ?? url;

  return (
    <div className="flex min-h-[min(70vh,800px)] w-full min-w-0 flex-col gap-2 overflow-hidden rounded-xl border border-govbid-border bg-govbid-elevated p-2">
      <iframe
        title={title}
        src={src}
        className="h-full min-h-[min(70vh,800px)] w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}
