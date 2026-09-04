import type { BinCollection, BinKind, Bins } from "../../../shared/types.ts";
import type { Config } from "../../config.ts";
import { type BinProvider, ProviderUnavailableError } from "./types.ts";

const HAVERING_COLLECTION_URL =
  "https://portal.havering.gov.uk/Process-Waste-CollectionDays/?type=CD&uprn=010096017137&usrn=21300590";

const LABEL_TO_KIND: Record<string, BinKind> = {
  "Domestic Waste": "general",
  Recycling: "recycling",
};

const DATE_PATTERN = /([A-Za-z]+,\s+[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)\s+\d{4})/;

function parseHaveringDate(value: string): string | null {
  const cleaned = value.replace(/(\d{1,2})(st|nd|rd|th)/, "$1");
  const match = /^[A-Za-z]+,\s+([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/.exec(cleaned);
  if (match === null) return null;

  const monthRaw = match[1];
  const dayRaw = match[2];
  const yearRaw = match[3];
  if (monthRaw === undefined || dayRaw === undefined || yearRaw === undefined) {
    return null;
  }

  const monthName = monthRaw.toLowerCase();
  const month = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].indexOf(monthName);
  if (month === -1) return null;

  const day = Number(dayRaw);
  const year = Number(yearRaw);
  if (!Number.isInteger(day) || !Number.isInteger(year)) return null;
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
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

export function extractHaveringCollections(html: string): BinCollection[] {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const grouped = new Map<string, Set<BinKind>>();

  for (const [label, kind] of Object.entries(LABEL_TO_KIND)) {
    const index = text.indexOf(label);
    if (index === -1) continue;
    const tail = text.slice(index + label.length, index + label.length + 120);
    const match = DATE_PATTERN.exec(tail);
    if (match === null) continue;

    const rawDate = match[1];
    if (rawDate === undefined) continue;
    const isoDate = parseHaveringDate(rawDate);
    if (isoDate === null) continue;
    addCollection(grouped, isoDate, kind);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, kinds]) => ({ date, kinds: [...kinds] }));
}

export const haveringProvider: BinProvider = {
  name: "havering",

  async fetch(_config: Config, today: string): Promise<Bins> {
    const response = await fetch(HAVERING_COLLECTION_URL);
    if (!response.ok) {
      throw new ProviderUnavailableError(`Havering responded ${response.status}`);
    }

    const html = await response.text();
    const collections = extractHaveringCollections(html).filter(({ date }) => date >= today);
    if (collections.length === 0) {
      throw new ProviderUnavailableError("Havering returned no upcoming collections");
    }

    return {
      provider: haveringProvider.name,
      next: collections[0] ?? null,
      following: collections[1] ?? null,
    };
  },
};
