import type { Rfp } from "@/lib/types";

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatCalendarDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");
}

function formatTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeCalendarText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldCalendarLine(line: string): string {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let current = "";

  for (const character of line) {
    const byteLimit = chunks.length === 0 ? 75 : 74;
    if (current && encoder.encode(current + character).length > byteLimit) {
      chunks.push(current);
      current = character;
    } else {
      current += character;
    }
  }

  if (current || chunks.length === 0) {
    chunks.push(current);
  }

  return chunks
    .map((chunk, index) => (index === 0 ? chunk : ` ${chunk}`))
    .join("\r\n");
}

function calendarFilename(rfp: Rfp): string {
  const slug = (rfp.name || rfp.title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return `rfp-deadline-${slug || rfp.id}.ics`;
}

export function hasCalendarDeadline(rfp: Rfp): boolean {
  return parseDateOnly(rfp.dueDate) !== null;
}

export function buildRfpDeadlineCalendar(
  rfp: Rfp,
  generatedAt = new Date(),
): string {
  const startDate = parseDateOnly(rfp.dueDate);
  if (!startDate) {
    throw new Error("This RFP does not have a valid deadline date.");
  }

  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 1);

  const description = [
    `Agency: ${rfp.agency}`,
    `Contract value: ${rfp.contract}`,
    "",
    rfp.description,
  ]
    .filter((line, index, lines) => line || lines[index - 1])
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GovBid//RFP Deadline Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeCalendarText(`${rfp.id}-deadline@govbid.app`)}`,
    `DTSTAMP:${formatTimestamp(generatedAt)}`,
    `DTSTART;VALUE=DATE:${formatCalendarDate(startDate)}`,
    `DTEND;VALUE=DATE:${formatCalendarDate(endDate)}`,
    `SUMMARY:${escapeCalendarText(`RFP deadline: ${rfp.name || rfp.title}`)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    `LOCATION:${escapeCalendarText(rfp.location)}`,
    "STATUS:CONFIRMED",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.map(foldCalendarLine).join("\r\n")}\r\n`;
}

export function downloadRfpDeadlineCalendar(rfp: Rfp): void {
  const calendar = buildRfpDeadlineCalendar(rfp);
  const blob = new Blob([calendar], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = calendarFilename(rfp);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
