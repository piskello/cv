import { readFileSync, existsSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { parseCitation, normalizeDoi, normalizeIsbn } from "./utils.mjs";
import { normalizeAuthors, normalizeEditors } from "./authors.mjs";

function firstValue(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function parsePages(citation, isiFirst, isiLast) {
  if (isiFirst && isiLast) return `${isiFirst}–${isiLast}`;
  const fromCitation = parseCitation(citation).pages;
  return fromCitation ?? "";
}

function parseYear(row, citation) {
  const fromCitation = parseCitation(citation).year;
  if (fromCitation) return fromCitation;
  const issued = firstValue(row["isi.date.issued[*]"], row["scopus.date.issued[*]"]);
  if (issued) return Number(String(issued).slice(0, 4));
  return null;
}

function parseTitle(row, citation) {
  const parsed = parseCitation(citation);
  return firstValue(
    parsed.title,
    row["isi.title[*]"],
    row["scopus.title.original[*]"],
    row["scopus.title[*]"],
  );
}

function parseAuthors(row, citation) {
  const fromCitation = citation?.split(" / ")[1]?.split(". -")[0]?.trim();
  return normalizeAuthors(
    firstValue(
      fromCitation,
      row["dc.relation.allauthors[en]"],
      row["isi.description.allpeopleoriginal[*]"],
      row["scopus.description.allpeopleoriginal[*]"],
    ),
  );
}

function parseEditors(row) {
  return normalizeEditors(firstValue(row["dc.relation.alleditors[en]"]));
}

function normalizePublisher(name, overrides) {
  const trimmed = String(name ?? "").trim();
  return overrides[trimmed] ?? trimmed;
}

function shouldSkipIrisRecord() {
  return false;
}

export function readIrisExport(config) {
  const path = config.irisPath ?? "IRIS-export.csv";
  if (!existsSync(path)) {
    console.warn(`IRIS export not found at ${path}; skipping IRIS merge.`);
    return [];
  }

  const csv = readFileSync(path, "utf8");
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  const records = [];
  for (const row of rows) {
    const collection = row.collection?.trim();
    const type = config.irisCollectionMap?.[collection];
    if (!type) continue;

    const citation = row["dc.identifier.citation[en]"] ?? "";
    if (shouldSkipIrisRecord()) continue;

    const title = parseTitle(row, citation);
    const year = parseYear(row, citation);
    if (!title || !year) continue;

    const authors = parseAuthors(row, citation);
    const editors = parseEditors(row);
    const isbn = normalizeIsbn(firstValue(row["dc.identifier.isbn[en]"], row["scopus.identifier.isbn[*]"]));
    const doi = normalizeDoi(
      firstValue(row["isi.identifier.doi[*]"], row["scopus.identifier.doi[*]"], row["iris.unpaywall.doi[*]"]),
    );
    const issn = firstValue(row["isi.identifier.eissn[*]"], row["scopus.identifier.eissn[*]"]);
    const publisher = normalizePublisher(row["dc.publisher.name[en]"], config.publisherOverrides ?? {});
    const bookTitle = firstValue(row["dc.relation.ispartofbook[en]"], row["dc.relation.conferencename[en]"]);
    let pages = parsePages(
      citation,
      row["isi.relation.firstpage[*]"],
      row["isi.relation.lastpage[*]"],
    );
    if (type === "edited_volume") pages = "";

    records.push({
      source: "iris",
      type,
      year,
      authors,
      editors,
      title,
      bookTitle,
      pages,
      publisher,
      journal: firstValue(row["isi.journal.journaltitle[*]"], row["scopus.title[*]"]),
      volume: firstValue(row["isi.relation.volume[*]"], row["scopus.relation.volume[*]"]),
      issue: firstValue(row["isi.relation.issue[*]"], row["scopus.relation.issue[*]"]),
      isbn,
      issn,
      doi,
      url: firstValue(row["iris.unpaywall.landingpage[*]"]),
      collection,
    });
  }

  return records;
}
