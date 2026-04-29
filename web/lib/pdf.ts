/** True if URL path looks like a PDF resource (for in-app viewer vs external link). */
export function isPdfUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /\.pdf$/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** True when URL points to Google Drive hostnames. */
export function isGoogleDriveUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "drive.google.com" || u.hostname === "docs.google.com";
  } catch {
    return false;
  }
}

/**
 * Convert common Google Drive share links to iframe-friendly preview links.
 * Returns null when file id cannot be extracted.
 */
export function toGoogleDrivePreviewUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!(u.hostname === "drive.google.com" || u.hostname === "docs.google.com")) {
      return null;
    }

    const byQuery = u.searchParams.get("id");
    if (byQuery) return `https://drive.google.com/file/d/${byQuery}/preview`;

    const parts = u.pathname.split("/").filter(Boolean);
    const dIndex = parts.indexOf("d");
    if (dIndex >= 0 && parts[dIndex + 1]) {
      return `https://drive.google.com/file/d/${parts[dIndex + 1]}/preview`;
    }

    return null;
  } catch {
    return null;
  }
}
