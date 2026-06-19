import { dedupKey, normalizeText, editorLabel, formatPages, trailingIdentifiers, bilingualTitle } from "./utils.mjs";
import { assignYearSuffixes, assignEditedVolumeSuffixes } from "./authors.mjs";

function yearLabel(record) {
  const suffix = record.yearSuffix ?? "";
  return `${record.year}${suffix}`;
}

function formatMonograph(record, locale) {
  const title = bilingualTitle(record, locale);
  const ids = trailingIdentifiers(record);
  return `${record.authors} (${yearLabel(record)}). *${title}*. ${record.publisher}. ${ids}`.replace(/\.\s+\./g, ".").trim();
}

function formatEditedVolume(record, locale) {
  const title = bilingualTitle(record, locale);
  const editors = record.authors || record.editors;
  const label = editorLabel(editors.split(",").filter(Boolean).length);
  const ids = trailingIdentifiers(record);
  return `${editors} ${label}. (${yearLabel(record)}). *${title}*. ${record.publisher}. ${ids}`.replace(/\.\s+\./g, ".").trim();
}

function formatChapter(record, locale) {
  const title = bilingualTitle(record, locale);
  const editors = record.editors;
  const label = editorLabel(editors.split(",").filter(Boolean).length);
  const book = record.bookTitle ? `*${record.bookTitle}*` : "";
  const pages = record.pages ? ` (${formatPages(record.pages)})` : "";
  const ids = trailingIdentifiers(record);
  const publisher = record.publisher ? `${record.publisher}. ` : "";
  return `${record.authors} (${yearLabel(record)}). ${title}. In ${editors} ${label}, ${book}${pages}. ${publisher}${ids}`.replace(/\.\s+\./g, ".").trim();
}

function formatJournal(record, locale) {
  const title = bilingualTitle(record, locale);
  const journal = record.journal ? `*${record.journal}*` : "";
  const volume = record.volume ? `*${record.volume}*` : "";
  const issue = record.issue ? `(${record.issue})` : "";
  const volIssue = [journal, volume && issue ? `${volume}${issue}` : volume].filter(Boolean).join(", ");
  const pageRange =
    record.pages && record.pages.includes("–")
      ? `, ${record.pages}`
      : record.pages
        ? `, ${record.pages}`
        : "";
  const ids = trailingIdentifiers(record);
  return `${record.authors} (${yearLabel(record)}). ${title}. ${volIssue}${pageRange}. ${ids}`.replace(/\.\s+\./g, ".").trim();
}

function formatProceedings(record, locale) {
  if (record.editors && !record.authors.includes("(Eds.)") && record.title?.toLowerCase().includes("proceedings")) {
    return formatEditedVolume({ ...record, authors: record.editors || record.authors }, locale);
  }
  const title = bilingualTitle(record, locale);
  const pages = record.pages ? ` (${formatPages(record.pages)})` : "";
  const ids = trailingIdentifiers(record);
  if (record.editors) {
    const label = editorLabel(record.editors.split(",").filter(Boolean).length);
    const container = record.bookTitle ? `*${record.bookTitle}*` : "";
    return `${record.authors} (${yearLabel(record)}). ${title}. In ${record.editors} ${label}, ${container}${pages}. ${record.publisher}. ${ids}`.replace(/\.\s+\./g, ".").trim();
  }
  const container = record.bookTitle ? `*${record.bookTitle}*` : "";
  const publisher = record.publisher ? `${record.publisher}. ` : "";
  return `${record.authors} (${yearLabel(record)}). ${title}. In ${container}${pages}. ${publisher}${ids}`.replace(/\.\s+\./g, ".").trim();
}

const FORMATTERS = {
  monograph: formatMonograph,
  edited_volume: formatEditedVolume,
  chapter: formatChapter,
  journal: formatJournal,
  proceedings: formatProceedings,
};

export function formatPublication(record, locale) {
  if (record.raw?.[locale]) return record.raw[locale];
  const formatter = FORMATTERS[record.type];
  if (!formatter) return record.raw?.en ?? "";
  return formatter(record, locale);
}

export function renderPublications(records, config, locale) {
  const headings = config.sectionHeadings[locale];
  const order = ["monograph", "edited_volume", "chapter", "journal", "proceedings"];
  const lines = [];

  for (const type of order) {
    const sectionRecords = records
      .filter((record) => record.type === type)
      .sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });

    if (sectionRecords.length === 0) continue;
    lines.push(`## ${headings[type]}`);
    for (const record of sectionRecords) {
      lines.push(formatPublication(record, locale));
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}

export function preparePublicationRecords(records) {
  const generated = records.filter((record) => !record.raw);
  assignEditedVolumeSuffixes(generated.filter((record) => record.type === "edited_volume"));
  assignYearSuffixes(generated.filter((record) => record.type !== "edited_volume"));
  return records;
}

export function fixEditedVolumeLine(line) {
  if (/\(Eds?\.\)/.test(line)) return line;
  return line.replace(
    /^(.+?\([^)]+\))\.\s+(\*[^*]+\*)/,
    (_, authorsYear, title) => {
      const match = authorsYear.match(/^(.+?)\s+\((\d{4}[a-z]?)\)$/);
      if (!match) return line;
      const label = editorLabel(match[1].split(",").filter((part) => part.trim()).length);
      return `${match[1]} ${label}. (${match[2]}). ${title}`;
    },
  );
}

export { dedupKey, normalizeText };
