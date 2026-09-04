import type { BinCollection, BinKind, Bins } from "../../../shared/types.ts";
import type { Config } from "../../config.ts";
import { type BinProvider, ProviderUnavailableError } from "./types.ts";

const HAVERING_COLLECTION_URL =
  "https://portal.havering.gov.uk/Process-Waste-CollectionDays/?type=CD&uprn=010096017137&usrn=21300590";
const HAVERING_COLLECTION_API_URL =
  "https://api-prd.havering.gov.uk/whitespace/GetCollectionByUprnAndDate";
const HAVERING_APIM_SUBSCRIPTION_KEY = "545bcf53c9094dfd980dd9da72b0514d";
const HAVERING_UPRN = "010096017137";

const LABEL_PATTERNS: ReadonlyArray<{ pattern: RegExp; kind: BinKind }> = [
  { pattern: /Domestic\s+Waste|Residual\s+Waste|General\s+Waste/gi, kind: "general" },
  { pattern: /Recycling|Mixed\s+Recycling/gi, kind: "recycling" },
  { pattern: /Garden\s+Waste/gi, kind: "garden" },
  { pattern: /Food\s+Waste/gi, kind: "food" },
];

const DATE_PATTERN =
  /((?:[A-Za-z]+,\s+)?[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?\s+\d{4})/;

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

function kindForService(raw: string): BinKind | null {
  const service = raw.toLowerCase();
  if (service.includes("recycling")) return "recycling";
  if (service.includes("garden")) return "garden";
  if (service.includes("food")) return "food";
  if (
    service.includes("domestic") ||
    service.includes("residual") ||
    service.includes("general")
  ) {
    return "general";
  }
  return null;
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

  for (const { pattern, kind } of LABEL_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const index = match.index;
      if (index === undefined) continue;
      const label = match[0] ?? "";
      const tail = text.slice(index + label.length, index + label.length + 120);
      const dateMatch = DATE_PATTERN.exec(tail);
      if (dateMatch === null) continue;

      const rawDate = dateMatch[1];
      if (rawDate === undefined) continue;
      const isoDate = parseHaveringDate(rawDate);
      if (isoDate === null) continue;
      addCollection(grouped, isoDate, kind);
    }
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, kinds]) => ({ date, kinds: [...kinds] }));
}

interface ApiCollectionRecord {
  service?: unknown;
  date?: unknown;
}

function extractApiCollectionRecords(raw: unknown): ApiCollectionRecord[] {
  if (typeof raw !== "object" || raw === null) return [];
  const response = raw as Record<string, unknown>;
  const byPath = response["getCollectionByUprnAndDateResponse"];
  if (typeof byPath !== "object" || byPath === null) return [];

  const result = (byPath as Record<string, unknown>)["getCollectionByUprnAndDateResult"];
  if (typeof result !== "object" || result === null) return [];

  const collections = (result as Record<string, unknown>)["Collections"];
  return Array.isArray(collections) ? (collections as ApiCollectionRecord[]) : [];
}

export function extractHaveringCollectionsFromApi(raw: unknown): BinCollection[] {
  const grouped = new Map<string, Set<BinKind>>();
  for (const entry of extractApiCollectionRecords(raw)) {
    const service = typeof entry.service === "string" ? entry.service : "";
    const date = typeof entry.date === "string" ? entry.date : "";
    if (service === "" || date === "") continue;

    const kind = kindForService(service);
    if (kind === null) continue;
    const isoDate = parseSlashDate(date);
    if (isoDate === null) continue;
    addCollection(grouped, isoDate, kind);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, kinds]) => ({ date, kinds: [...kinds] }));
}

function parsedHaveringCollections(html: string): BinCollection[] {
  return extractHaveringCollections(html);
}

async function fetchCollectionsFromApi(today: string): Promise<{ raw: unknown; collections: BinCollection[] }> {
  const response = await fetch(HAVERING_COLLECTION_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "ocp-apim-subscription-key": HAVERING_APIM_SUBSCRIPTION_KEY,
    },
    body: JSON.stringify({
      getCollectionByUprnAndDate: {
        getCollectionByUprnAndDateInput: {
          uprn: HAVERING_UPRN,
          nextCollectionFromDate: today,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new ProviderUnavailableError(`Havering API responded ${response.status}`);
  }

  const raw = (await response.json()) as unknown;
  return {
    raw,
    collections: extractHaveringCollectionsFromApi(raw),
  };
}

async function fetchCollectionsFromHtml(): Promise<{ raw: string; collections: BinCollection[] }> {
  const response = await fetch(HAVERING_COLLECTION_URL);
  if (!response.ok) {
    throw new ProviderUnavailableError(`Havering responded ${response.status}`);
  }

  const html = await response.text();
  return {
    raw: html,
    collections: parsedHaveringCollections(html),
  };
}

export async function fetchHaveringDebug(
  today: string,
): Promise<{ provider: string; parsed: Bins; raw: unknown }> {
  let raw: unknown;
  let collections: BinCollection[] = [];

  try {
    const apiResult = await fetchCollectionsFromApi(today);
    raw = apiResult.raw;
    collections = apiResult.collections;
  } catch (error) {
    if (!(error instanceof ProviderUnavailableError)) throw error;
    const htmlResult = await fetchCollectionsFromHtml();
    raw = htmlResult.raw;
    collections = htmlResult.collections;
  }

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
      // manual values that look valid but are unrelated to council output.
      throw new Error("Havering returned no parseable collections");
    }

    return debug.parsed;
  },
};
