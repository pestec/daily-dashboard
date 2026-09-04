import type { BinCollection, BinKind, Bins } from "../../../shared/types.ts";
import type { Config } from "../../config.ts";
import { type BinProvider, ProviderUnavailableError } from "./types.ts";

const HAVERING_COLLECTION_URL =
  "https://portal.havering.gov.uk/Process-Waste-CollectionDays/?type=CD&uprn=010096017137&usrn=21300590";
const LABEL_PATTERNS: ReadonlyArray<{ pattern: RegExp; kind: BinKind }> = [
  { pattern: /Domestic\s*Waste/gi, kind: "general" },
  { pattern: /Recycling/gi, kind: "recycling" },
];

const LONG_DATE_PATTERN =
  /((?:[A-Za-z]+,\s+)?[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4})/;
const SLASH_DATE_PATTERN = /(\d{1,2}\/\d{1,2}\/\d{4})/;

function parseHaveringDate(value: string): string | null {
  const cleaned = value.replace(/(\d{1,2})(st|nd|rd|th)/, "$1");
  const match = /^(?:[A-Za-z]+,\s+)?([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/.exec(cleaned);
  if (match === null) return null;

  const monthRaw = match[1];
  const dayRaw = match[2];
  const yearRaw = match[3];
  if (monthRaw === undefined || dayRaw === undefined || yearRaw === undefined) {
    return null;
  }

  const monthName = monthRaw.toLowerCase();
  const monthNames = [
    ["january", "jan"],
    ["february", "feb"],
    ["march", "mar"],
    ["april", "apr"],
    ["may"],
    ["june", "jun"],
    ["july", "jul"],
    ["august", "aug"],
    ["september", "sep", "sept"],
    ["october", "oct"],
    ["november", "nov"],
    ["december", "dec"],
  ];
  const month = monthNames.findIndex((names) => names.includes(monthName));
  if (month === -1) return null;

  const day = Number(dayRaw);
  const year = Number(yearRaw);
  if (!Number.isInteger(day) || !Number.isInteger(year)) return null;
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function parseSlashDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (match === null) return null;

  const dayRaw = match[1];
  const monthRaw = match[2];
  const yearRaw = match[3];
  if (dayRaw === undefined || monthRaw === undefined || yearRaw === undefined) {
    return null;
  }

  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function addCollection(
  grouped: Map<string, Set<BinKind>>,
  date: string,
  kind: BinKind,
): void {
  const kinds = grouped.get(date) ?? new Set<BinKind>();
  kinds.add(kind);
  grouped.set(date, kinds);
}

function extractDateAfterLabel(tail: string): string | null {
  const longDateMatch = LONG_DATE_PATTERN.exec(tail);
  if (longDateMatch?.[1] !== undefined) {
    const parsed = parseHaveringDate(longDateMatch[1]);
    if (parsed !== null) return parsed;
  }

  const slashDateMatch = SLASH_DATE_PATTERN.exec(tail);
  if (slashDateMatch?.[1] !== undefined) {
    const parsed = parseSlashDate(slashDateMatch[1]);
    if (parsed !== null) return parsed;
  }

  return null;
}

export function extractHaveringCollections(html: string): BinCollection[] {
  const text = html
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const grouped = new Map<string, Set<BinKind>>();

  for (const { pattern, kind } of LABEL_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const index = match.index;
      if (index === undefined) continue;
      const label = match[0] ?? "";
      const tail = text.slice(index + label.length, index + label.length + 160);
      const isoDate = extractDateAfterLabel(tail);
      if (isoDate === null) continue;
      addCollection(grouped, isoDate, kind);
    }
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, kinds]) => ({ date, kinds: [...kinds] }));
}

async function fetchCollectionsFromHtml(): Promise<{ raw: string; collections: BinCollection[] }> {
  const response = await fetch(HAVERING_COLLECTION_URL);
  if (!response.ok) {
    throw new ProviderUnavailableError(`Havering responded ${response.status}`);
  }

  const html = await response.text();
  return {
    raw: html,
    collections: extractHaveringCollections(html),
  };
}

export async function fetchHaveringDebug(
  _today: string,
): Promise<{ provider: string; parsed: Bins; raw: unknown }> {
  const htmlResult = await fetchCollectionsFromHtml();
  const raw = htmlResult.raw;
  const collections = htmlResult.collections;

  const parsed: Bins = {
    provider: haveringProvider.name,
    next: collections[0] ?? null,
    following: collections[1] ?? null,
  };

  return {
    provider: haveringProvider.name,
    parsed,
    raw,
  };
}

export const haveringProvider: BinProvider = {
  name: "havering",

  async fetch(_config: Config, today: string): Promise<Bins> {
    const debug = await fetchHaveringDebug(today);
    if (debug.parsed.next === null && debug.parsed.following === null) {
      // Parse-empty is a data-shape problem and should not silently degrade to
      // a hard tile error when a configured fallback schedule exists.
      throw new ProviderUnavailableError("Havering returned no parseable collections");
    }

    return debug.parsed;
  },
};
