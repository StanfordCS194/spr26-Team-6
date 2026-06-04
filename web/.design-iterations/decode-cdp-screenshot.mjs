#!/usr/bin/env node
/** Decode latest CDP Page.captureScreenshot JSON log to PNG */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const logDir = process.env.CDP_LOG_DIR ?? path.join(process.env.HOME ?? "", ".cursor/browser-logs");
const outPath = process.argv[2];
if (!outPath) {
  console.error("Usage: decode-cdp-screenshot.mjs <output.png>");
  process.exit(1);
}

const files = readdirSync(logDir)
  .filter((f) => f.startsWith("cdp-response-Page.captureScreenshot-") && f.endsWith(".json"))
  .map((f) => ({ f, m: statSync(path.join(logDir, f)).mtimeMs }))
  .sort((a, b) => b.m - a.m);

if (!files.length) {
  console.error("No CDP screenshot logs found in", logDir);
  process.exit(1);
}

const latest = path.join(logDir, files[0].f);
const json = JSON.parse(readFileSync(latest, "utf8"));
const data = json.data ?? json.result?.data;
if (!data) {
  console.error("No base64 data in", latest);
  process.exit(1);
}

writeFileSync(outPath, Buffer.from(data, "base64"));
console.log(`Wrote ${outPath} from ${files[0].f}`);
