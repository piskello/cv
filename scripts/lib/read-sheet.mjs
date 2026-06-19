import { readFileSync, existsSync } from "node:fs";
import { google } from "googleapis";
import { pickField, resolveType } from "./utils.mjs";
import { normalizeAuthors, normalizeEditors } from "./authors.mjs";

async function fetchCsvExport(spreadsheetId, gid) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CSV export failed (${response.status})`);
  }
  return response.text();
}

function rowsFromCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map((value) => value.trim());
}

async function fetchSheetApi(config, gid) {
  const credentialsPath = config.credentialsPath ?? "credentials.json";
  if (!existsSync(credentialsPath)) return null;

  const credentials = JSON.parse(readFileSync(credentialsPath, "utf8"));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: config.spreadsheetId });
  const sheet = meta.data.sheets?.find((item) => String(item.properties?.sheetId) === String(gid));
  const title = sheet?.properties?.title;
  if (!title) throw new Error(`Sheet gid ${gid} not found`);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: title,
  });
  const values = response.data.values ?? [];
  if (values.length === 0) return [];
  const [headers, ...rows] = values;
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
  );
}

function mapPublicationRow(row, config) {
  const aliases = config.columnAliases.publications;
  const rawType = pickField(row, aliases.type);
  const type = resolveType(rawType, config.publicationTypeAliases);
  const year = Number(pickField(row, aliases.year));
  const title = pickField(row, aliases.title);
  if (!type || !year || !title) return null;

  return {
    source: "sheet",
    type,
    year,
    authors: normalizeAuthors(pickField(row, aliases.authors)),
    title,
    titleIt: pickField(row, aliases.titleIt),
    titleEn: pickField(row, aliases.titleEn),
    editors: normalizeEditors(pickField(row, aliases.editors)),
    bookTitle: pickField(row, aliases.bookTitle),
    pages: pickField(row, aliases.pages),
    publisher: pickField(row, aliases.publisher),
    journal: pickField(row, aliases.journal),
    volume: pickField(row, aliases.volume),
    issue: pickField(row, aliases.issue),
    isbn: pickField(row, aliases.isbn),
    issn: pickField(row, aliases.issn),
    doi: pickField(row, aliases.doi),
    url: pickField(row, aliases.url),
    sortOrder: Number(pickField(row, aliases.sortOrder) || 0),
  };
}

function mapEventRow(row, config) {
  const aliases = config.columnAliases.events;
  const rawType = pickField(row, aliases.type);
  const type = resolveType(rawType, config.eventTypeAliases);
  const year = Number(pickField(row, aliases.year));
  const title = pickField(row, aliases.title);
  if (!type || !year || !title) return null;

  const onlineRaw = pickField(row, aliases.online).toLowerCase();
  return {
    source: "sheet",
    type,
    year,
    title,
    titleEn: pickField(row, aliases.titleEn),
    venue: pickField(row, aliases.venue),
    city: pickField(row, aliases.city),
    countryCode: pickField(row, aliases.countryCode),
    online: ["true", "yes", "1", "online", "si", "sì"].includes(onlineRaw),
    sortOrder: Number(pickField(row, aliases.sortOrder) || 0),
  };
}

export async function readSheetTab(config, kind) {
  const tab = config.tabs?.[kind];
  if (!tab) return [];

  const credentialsPath = config.credentialsPath ?? "credentials.json";
  if (!existsSync(credentialsPath)) {
    console.warn(`Skipping sheet ${kind}: add ${credentialsPath} for Google Sheets API access.`);
    return [];
  }

  try {
    const rows = await fetchSheetApi(config, tab.gid);
    if (!rows) return [];
    return kind === "publications"
      ? rows.map((row) => mapPublicationRow(row, config)).filter(Boolean)
      : rows.map((row) => mapEventRow(row, config)).filter(Boolean);
  } catch (error) {
    console.warn(`Google Sheet read failed for ${kind}: ${error.message}`);
    return [];
  }
}
