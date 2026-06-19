import { readFileSync } from "node:fs";
import { dedupKey, normalizeDoi, normalizeIsbn, normalizeText } from "./utils.mjs";
import { fixEditedVolumeLine } from "./format-publication.mjs";

const SECTION_TO_TYPE = {
  monographs: "monograph",
  monografie: "monograph",
  "edited volumes": "edited_volume",
  curatele: "edited_volume",
  "essays and book chapters": "chapter",
  "saggi e capitoli in libri": "chapter",
  "journal articles": "journal",
  "articoli su riviste scientifiche": "journal",
  proceedings: "proceedings",
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectType(heading) {
  return SECTION_TO_TYPE[heading.trim().toLowerCase()] ?? null;
}

function extractIsbn(line) {
  const match = line.match(/ISBN\s+([0-9Xx-]+)/i);
  return match ? match[1].replace(/[^0-9Xx]/g, "") : "";
}

function extractDoi(line) {
  const match = line.match(/doi\.org\/(\S+)/i);
  return match ? match[1] : "";
}

function extractYear(line) {
  const match = line.match(/\((\d{4})([a-z])?\)/);
  if (!match) return { year: null, yearSuffix: "" };
  return { year: Number(match[1]), yearSuffix: match[2] ?? "" };
}

export function parsePublicationsFromMarkdown(content) {
  const records = [];
  let currentType = null;

  for (const line of content.split("\n")) {
    const section = line.match(/^##\s+(.+)$/);
    if (section) {
      currentType = detectType(section[1]);
      continue;
    }
    if (!line.trim() || !currentType) continue;

    const fixedLine =
      currentType === "edited_volume" ? fixEditedVolumeLine(line.trim()) : line.trim();
    const { year, yearSuffix } = extractYear(fixedLine);
    records.push({
      source: "cv",
      type: currentType,
      year,
      yearSuffix,
      isbn: extractIsbn(fixedLine),
      doi: extractDoi(fixedLine),
      raw: { en: fixedLine, it: fixedLine },
    });
  }

  return records;
}

export function attachLocaleLines(enRecords, itContent) {
  const itRecords = parsePublicationsFromMarkdown(itContent);
  let pointer = 0;
  for (const record of enRecords) {
    while (pointer < itRecords.length && itRecords[pointer].type !== record.type) {
      pointer += 1;
    }
    if (pointer < itRecords.length && itRecords[pointer].type === record.type) {
      record.raw.it = itRecords[pointer].raw.en;
      pointer += 1;
    }
  }
  return enRecords;
}

export function mergeRecords({
  cvRecords,
  sheetRecords,
  irisRecords,
  includeIrisOnly = false,
  irisAddFromYear = 2026,
}) {
  const merged = new Map();

  for (const record of cvRecords) {
    const key = dedupKey({
      doi: record.doi,
      isbn: record.isbn,
      title: record.raw?.en ?? "",
      year: record.year,
      authors: record.raw?.en?.split("(")[0] ?? "",
    });
    merged.set(key, { ...record, source: "cv" });
  }

  for (const record of sheetRecords) {
    const key = dedupKey(record);
    const existing = findMatchingRecord(merged, record);
    if (existing) {
      merged.set(existing, { ...merged.get(existing), ...record, raw: merged.get(existing).raw });
    } else {
      merged.set(key, record);
    }
  }

  for (const record of irisRecords) {
    const existingKey = findMatchingRecord(merged, record);
    if (existingKey) {
      const existing = merged.get(existingKey);
      merged.set(existingKey, {
        ...existing,
        ...Object.fromEntries(
          Object.entries(record).filter(([field, value]) => {
            if (["source", "type"].includes(field)) return false;
            if (existing.raw && ["title", "authors"].includes(field)) return false;
            return value !== "" && value != null;
          }),
        ),
        raw: existing.raw,
        source: existing.source === "cv" ? "cv+iris" : existing.source,
      });
      continue;
    }

    if (includeIrisOnly || record.year >= irisAddFromYear) {
      merged.set(dedupKey(record), record);
    }
  }

  return [...merged.values()].filter((record) => record.type && record.year);
}

function findMatchingRecord(merged, record) {
  for (const [key, existing] of merged.entries()) {
    if (record.doi && existing.doi && normalizeDoi(record.doi) === normalizeDoi(existing.doi)) {
      if (record.type === existing.type) return key;
    }
    if (record.isbn && existing.isbn && normalizeIsbn(record.isbn) === normalizeIsbn(existing.isbn)) {
      if (record.type !== existing.type) continue;
      return key;
    }
    if (
      record.year &&
      existing.year === record.year &&
      record.type === existing.type &&
      record.title &&
      normalizeText(record.title).slice(0, 40) ===
        normalizeText(existing.raw?.en ?? existing.title ?? "").slice(0, 40)
    ) {
      return key;
    }
  }
  return null;
}

export function patchMarkdown(filePath, markerName, newContent) {
  const content = readFileSync(filePath, "utf8");
  return patchMarkdownFromString(content, markerName, newContent);
}

export function patchMarkdownFromString(content, markerName, newContent) {
  const start = `<!-- sync:${markerName}:start -->`;
  const end = `<!-- sync:${markerName}:end -->`;
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  if (!pattern.test(content)) {
    throw new Error(`Markers sync:${markerName} not found`);
  }
  return content.replace(pattern, `${start}\n${newContent.trimEnd()}\n${end}`);
}

export function extractMarkerContent(content, markerName) {
  const start = `<!-- sync:${markerName}:start -->`;
  const end = `<!-- sync:${markerName}:end -->`;
  const pattern = new RegExp(`${escapeRegExp(start)}\\n([\\s\\S]*?)\\n${escapeRegExp(end)}`);
  const match = content.match(pattern);
  return match?.[1] ?? "";
}

export function applyEditedVolumeFixesToRawRecords(records) {
  for (const record of records) {
    if (record.type !== "edited_volume" || !record.raw) continue;
    record.raw.en = fixEditedVolumeLine(record.raw.en);
    record.raw.it = fixEditedVolumeLine(record.raw.it);
  }
  return records;
}

export function enrichNewIrisRecords(records) {
  return records.map((record) => {
    if (record.raw) return record;
    if (record.type === "edited_volume" && !record.authors && record.editors) {
      record.authors = record.editors;
    }
    if (record.type === "chapter") {
      if (record.title?.includes("Better World")) {
        record.authors = "Bollini, L., Facchini, C., Moretti, M.";
        record.editors = "L. Bollini, C. Facchini, M. Moretti";
        record.bookTitle = "WUD 2024. Designing for Better World";
      }
      if (record.title?.includes("Postdisciplinary")) {
        record.authors = "Moretti, M., Bollini, L., Facchini, C.";
        record.editors = "M. Moretti, L. Bollini, C. Facchini";
        record.bookTitle = "WUD 2023. Collaboration and Cooperation";
        record.pages = record.pages || "7–11";
      }
      record.publisher = "AIAP edizioni";
    }
    if (record.type === "edited_volume") {
      record.publisher = "AIAP edizioni";
      if (record.title?.includes("WUD 2023") || record.isbn === "9788899718374") {
        record.authors = "Moretti, M., Bollini, L., Facchini, C.";
        record.title = "WUD 2023. Collaboration and Cooperation";
      }
      if (record.title?.includes("WUD 2024") || record.isbn === "9788899718404") {
        record.authors = "Moretti, M., Bollini, L., Facchini, C.";
        record.title = "WUD 2024. Designing for Better World";
      }
      delete record.url;
    }
    if (record.type === "chapter") {
      delete record.url;
    }
    return record;
  });
}
