import { normalizeText } from "./utils.mjs";

const SURNAME_PARTICLES = new Set([
  "de",
  "de angeli",
  "del",
  "della",
  "di",
  "du",
  "la",
  "le",
  "van",
  "von",
]);

function splitNameParts(name) {
  const cleaned = name
    .replace(/\s+/g, " ")
    .replace(/\./g, "")
    .trim();
  if (!cleaned) return { surname: "", given: "" };

  const comma = cleaned.split(",");
  if (comma.length >= 2) {
    return {
      surname: comma[0].trim(),
      given: comma.slice(1).join(",").trim(),
    };
  }

  const tokens = cleaned.split(" ");
  if (tokens.length === 1) return { surname: tokens[0], given: "" };

  let surnameStart = tokens.length - 1;
  while (surnameStart > 0) {
    const particle = tokens.slice(0, surnameStart).join(" ").toLowerCase();
    if (SURNAME_PARTICLES.has(particle) || SURNAME_PARTICLES.has(tokens[surnameStart - 1].toLowerCase())) {
      surnameStart -= 1;
    } else {
      break;
    }
  }

  return {
    surname: tokens.slice(surnameStart).join(" "),
    given: tokens.slice(0, surnameStart).join(" "),
  };
}

function initials(given) {
  return given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(" ");
}

export function formatAuthorApa(name) {
  const { surname, given } = splitNameParts(name.trim());
  if (!surname) return name.trim();
  if (!given) {
    const compact = surname.split(/\s+/);
    if (compact.length >= 2 && compact[0].length <= 2) {
      return `${compact.slice(1).join(" ")}, ${compact[0].charAt(0).toUpperCase()}.`;
    }
    return surname;
  }
  const formattedSurname =
    surname
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ") || surname;
  return `${formattedSurname}, ${initials(given)}`;
}

export function normalizeAuthors(raw) {
  if (!raw) return "";
  const parts = String(raw)
    .split(/;|&|(?:\band\b)/i)
    .flatMap((chunk) => chunk.split(/,(?=[^,]+,)/))
    .map((part) => part.trim())
    .filter(Boolean);

  const unique = [];
  const seen = new Set();
  for (const part of parts) {
    const formatted = formatAuthorApa(part.replace(/;+/g, "").trim());
    const key = normalizeText(formatted);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(formatted);
  }
  return unique.join(", ");
}

export function normalizeEditors(raw) {
  return normalizeAuthors(raw);
}

export function firstAuthorSurname(authors) {
  const first = authors.split(",")[0]?.trim() ?? "";
  const match = first.match(/^(.+?),\s*[A-Z]/);
  return match ? match[1] : first;
}

export function assignYearSuffixes(records) {
  const groups = new Map();
  for (const record of records) {
    const surname = firstAuthorSurname(record.authors ?? "");
    const key = `${normalizeText(surname)}|${record.year}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) {
      group[0].yearSuffix = group[0].yearSuffix ?? "";
      continue;
    }
    group.sort((a, b) => {
      const titleA = normalizeText(a.title);
      const titleB = normalizeText(b.title);
      if (titleA !== titleB) return titleA.localeCompare(titleB);
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
    group.forEach((record, index) => {
      record.yearSuffix = String.fromCharCode(97 + index);
    });
  }
}

export function assignEditedVolumeSuffixes(records) {
  const groups = new Map();
  for (const record of records) {
    const key = `${normalizeText(record.authors)}|${record.year}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  for (const group of groups.values()) {
    if (group.length <= 1) {
      group[0].yearSuffix = group[0].yearSuffix ?? "";
      continue;
    }
    group.sort((a, b) => normalizeText(a.title).localeCompare(normalizeText(b.title)));
    group.forEach((record, index) => {
      record.yearSuffix = String.fromCharCode(97 + index);
    });
  }
}
