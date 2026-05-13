/**
 * Server-only helpers for profile suggestion (URL safety + HTML stripping).
 * Imported from Route Handlers only.
 */

const MAX_RESPONSE_CHARS = 500_000;
const MAX_TEXT_FOR_LLM = 100_000;

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_FOR_LLM);
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "0.0.0.0" || h === "::1") return true;
  if (h.startsWith("[")) {
    if (h === "[::1]") return true;
    const inner = h.slice(1, -1).toLowerCase();
    if (inner.startsWith("fe80:")) return true;
    if (inner.startsWith("fc") || inner.startsWith("fd")) return true;
    return false;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4) {
    const parts = [ipv4[1], ipv4[2], ipv4[3], ipv4[4]].map(Number);
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

/** Returns normalized https URL string, or throws with a short message. */
export function assertHttpsPublicUrl(raw: string): string {
  const trimmed = raw.trim();
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (u.protocol !== "https:") {
    throw new Error("Only https URLs are allowed.");
  }
  if (isBlockedHostname(u.hostname)) {
    throw new Error("That host is not allowed.");
  }
  return u.toString();
}

export type FetchWebsiteResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export async function fetchWebsitePlainText(
  httpsUrl: string,
): Promise<FetchWebsiteResult> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(httpsUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "GovBidProfileBot/1.0 (+https://github.com/StanfordCS194/spr26-Team-6)",
        Accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `Website returned HTTP ${res.status}. Try pasting text instead.`,
      };
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain/i.test(ct) && !ct.includes("application/xhtml")) {
      return {
        ok: false,
        error:
          "That URL did not return HTML or plain text. Paste your content instead.",
      };
    }
    const raw = await res.text();
    const slice = raw.slice(0, MAX_RESPONSE_CHARS);
    const text = stripHtmlToText(slice);
    if (text.length < 80) {
      return {
        ok: false,
        error:
          "Very little readable text came from that page (it may be JavaScript-heavy). Paste your narrative instead.",
      };
    }
    return { ok: true, text };
  } catch (e) {
    const msg =
      e instanceof Error && e.name === "AbortError"
        ? "Request timed out."
        : e instanceof Error
          ? e.message
          : "Fetch failed.";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(t);
  }
}
