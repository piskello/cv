const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeIsbn(value) {
  return String(value ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

export function normalizeDoi(value) {
  return String(value ?? "")
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:/i, "")
    .toLowerCase();
}

export function formatPages(value) {
  if (!value) return "";
  const text = String(value).trim();
  const range = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return `pp. ${range[1]}–${range[2]}`;
  const single = text.match(/^p?\.?\s*(\d+)$/i);
  if (single) return `p. ${single[1]}`;
  if (/^pp?\.\s/i.test(text)) return text.replace(/-/g, "–");
  return text.includes("–") ? text : text.replace(/(\d+)\s*-\s*(\d+)/g, "$1–$2");
}

export function dedupKey(record) {
  const doi = normalizeDoi(record.doi);
  if (doi) return `doi:${doi}`;
  const isbn = normalizeIsbn(record.isbn);
  const title = normalizeText(record.title);
  if (isbn && title) return `isbn:${isbn}|${title}`;
  const year = record.year ?? "";
  const authors = normalizeText(record.authors?.split(",")[0] ?? "");
  if (title && year) return `title:${title}|${year}|${authors}`;
  return `raw:${title}|${year}`;
}

export function parseCitation(citation) {
  if (!citation) return {};
  const result = {};
  const titleAuthors = citation.split(" / ");
  if (titleAuthors[0]) result.title = titleAuthors[0].trim();
  const yearMatch = citation.match(/\((\d{4})([a-z])?\)/i);
  if (yearMatch) {
    result.year = Number(yearMatch[1]);
    result.yearSuffix = yearMatch[2] ?? "";
  }
  const pagesMatch = citation.match(/pp?\.\s*([\d–-]+(?:\s*[-–]\s*[\d]+)?)/i);
  if (pagesMatch) result.pages = pagesMatch[1].replace(/\s*-\s*/g, "–");
  return result;
}

export function editorLabel(count) {
  return count === 1 ? "(Ed.)" : "(Eds.)";
}

export function formatMonthYear(year, month) {
  if (!month) return String(year);
  const name = Object.entries(MONTHS).find(([, n]) => n === month)?.[0];
  if (!name) return String(year);
  return `${year}, ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

export function pickField(row, aliases = []) {
  for (const alias of aliases) {
    const target = alias.toLowerCase();
    for (const [key, value] of Object.entries(row)) {
      if (key.toLowerCase() === target && String(value ?? "").trim()) {
        return String(value).trim();
      }
    }
  }
  return "";
}

export function resolveType(raw, aliasesMap) {
  const value = normalizeText(raw);
  for (const [type, aliases] of Object.entries(aliasesMap)) {
    if (aliases.some((alias) => normalizeText(alias) === value)) return type;
  }
  return "";
}

export function trailingIdentifiers(record) {
  const parts = [];
  if (record.isbn) parts.push(`ISBN ${normalizeIsbn(record.isbn)}`);
  if (record.issn) parts.push(`ISSN ${record.issn}`);
  if (record.doi) {
    const doi = normalizeDoi(record.doi);
    parts.push(`https://doi.org/${doi}`);
  } else if (record.url) {
    parts.push(record.url.trim());
  }
  return parts.join(". ");
}

export function bilingualTitle(record, locale) {
  const it = record.titleIt || record.title;
  const en = record.titleEn || record.title;
  if (locale === "it") return it;
  if (record.titleIt && record.titleEn && record.titleIt !== record.titleEn) {
    return `${record.titleIt} / ${record.titleEn}`;
  }
  return en;
}
