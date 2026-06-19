export function renderEvents(records, config, locale) {
  const headings = config.eventHeadings[locale];
  const order = ["talk", "lecture", "exhibition", "conference", "award"];
  const lines = [];

  for (const type of order) {
    const sectionRecords = records.filter((record) => record.type === type);
    if (sectionRecords.length === 0) continue;

    lines.push(`## ${headings[type]}`);
    const years = [...new Set(sectionRecords.map((record) => record.year))].sort((a, b) => b - a);
    for (const year of years) {
      lines.push(`@years ${year}  `);
      const yearRecords = sectionRecords
        .filter((record) => record.year === year)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      for (const record of yearRecords) {
        lines.push(`${formatEventLine(record, locale)}  `);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}

function formatEventLine(record, locale) {
  const title =
    locale === "en" && record.titleEn
      ? `${record.title} / ${record.titleEn}`
      : record.title;

  let location = record.venue ?? "";
  if (record.online) {
    location += location ? " (online)" : "(online)";
  }
  if (record.city) {
    location += location ? `, ${record.city}` : record.city;
  }
  if (record.countryCode) {
    location += ` (${record.countryCode})`;
  }

  return `*${title}* ${location}`.trim();
}

export function parseEventsFromMarkdown(content, config) {
  const headingToType = Object.fromEntries(
    Object.entries(config.eventHeadings.en).map(([type, heading]) => [heading.toLowerCase(), type]),
  );

  const records = [];
  let currentType = null;
  let currentYear = null;

  for (const line of content.split("\n")) {
    const section = line.match(/^##\s+(.+)$/);
    if (section) {
      currentType = headingToType[section[1].trim().toLowerCase()] ?? null;
      currentYear = null;
      continue;
    }
    const year = line.match(/^@years\s+(\d{4})/);
    if (year) {
      currentYear = Number(year[1]);
      continue;
    }
    const event = line.match(/^\*(.+?)\*\s+(.+?)\s{2,}$/);
    if (event && currentType && currentYear) {
      const titlePart = event[1];
      const [titleIt, titleEn] = titlePart.includes(" / ")
        ? titlePart.split(" / ").map((part) => part.trim())
        : [titlePart, ""];
      records.push({
        source: "cv",
        type: currentType,
        year: currentYear,
        title: titleIt,
        titleEn,
        venue: event[2],
      });
    }
  }

  return records;
}
