import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readIrisExport } from "./lib/read-iris.mjs";
import { readSheetTab } from "./lib/read-sheet.mjs";
import {
  parsePublicationsFromMarkdown,
  attachLocaleLines,
  mergeRecords,
  patchMarkdownFromString,
  applyEditedVolumeFixesToRawRecords,
  enrichNewIrisRecords,
  extractMarkerContent,
} from "./lib/merge.mjs";
import { preparePublicationRecords, renderPublications } from "./lib/format-publication.mjs";
import { renderEvents, parseEventsFromMarkdown } from "./lib/format-event.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const config = JSON.parse(readFileSync(path.join(__dirname, "config.json"), "utf8"));
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const enPath = path.join(root, "EN.md");
  const itPath = path.join(root, "IT.md");
  const enContent = readFileSync(enPath, "utf8");
  const itContent = readFileSync(itPath, "utf8");

  const cvPublicationsEn = extractMarkerContent(enContent, "publications");
  const cvPublicationsIt = extractMarkerContent(itContent, "publications");
  let cvRecords = parsePublicationsFromMarkdown(cvPublicationsEn);
  cvRecords = attachLocaleLines(cvRecords, cvPublicationsIt);
  cvRecords = applyEditedVolumeFixesToRawRecords(cvRecords);

  const irisRecords = readIrisExport(config);
  const sheetPublications = await readSheetTab(config, "publications");
  const sheetEvents = await readSheetTab(config, "events");

  let merged = mergeRecords({
    cvRecords,
    sheetRecords: sheetPublications,
    irisRecords,
    includeIrisOnly: config.includeIrisOnly === true,
    irisAddFromYear: config.irisAddFromYear ?? 2026,
  });
  merged = enrichNewIrisRecords(merged);
  merged = preparePublicationRecords(merged);

  const publicationsEn = renderPublications(merged, config, "en");
  const publicationsIt = renderPublications(merged, config, "it");

  const cvEventsEn = extractMarkerContent(enContent, "events");
  const eventRecords =
    sheetEvents.length > 0 && sheetEvents.some((record) => record.venue || record.city)
      ? sheetEvents
      : parseEventsFromMarkdown(cvEventsEn, config);
  const eventsEn = renderEvents(eventRecords, config, "en");
  const eventsIt = renderEvents(eventRecords, config, "it");

  const newEntries = merged.filter((record) => !record.raw && record.source?.includes("iris"));
  console.log(`Publications: ${merged.length} total (${newEntries.length} from IRIS)`);
  console.log(`Events: ${eventRecords.length} total (${sheetEvents.length} from sheet)`);
  if (newEntries.length) {
    console.log("New IRIS entries:");
    for (const record of newEntries) {
      console.log(`  - [${record.type}] ${record.year} ${record.title}`);
    }
  }

  if (dryRun) {
    console.log("\n--- EN publications preview (first 40 lines) ---");
    console.log(publicationsEn.split("\n").slice(0, 40).join("\n"));
    return;
  }

  let nextEn = patchMarkdownFromString(enContent, "publications", publicationsEn);
  nextEn = patchMarkdownFromString(nextEn, "events", eventsEn);
  let nextIt = patchMarkdownFromString(itContent, "publications", publicationsIt);
  nextIt = patchMarkdownFromString(nextIt, "events", eventsIt);

  writeFileSync(enPath, nextEn);
  writeFileSync(itPath, nextIt);
  console.log("Updated EN.md and IT.md");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
