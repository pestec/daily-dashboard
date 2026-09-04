import puppeteer from "@cloudflare/puppeteer";
import type { BinCollection, BinKind, Bins } from "../../../shared/types.ts";
import type { Config } from "../../config.ts";
import type { Env } from "../../env.ts";
import { type BinProvider, ProviderUnavailableError } from "./types.ts";

const HAVERING_COLLECTION_URL =
  "https://portal.havering.gov.uk/Process-Waste-CollectionDays/?type=CD&uprn=010096017137&usrn=21300590";
const LABEL_PATTERNS: ReadonlyArray<{ pattern: RegExp; kind: BinKind }> = [
  { pattern: /Domestic\s*Waste/i, kind: "general" },
  { pattern: /Recycling/i, kind: "recycling" },
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

function extractDate(value: string): string | null {
  const compact = value.replace(/\s+/g, " ").trim();
  const longDateMatch = LONG_DATE_PATTERN.exec(compact);
  if (longDateMatch?.[1] !== undefined) {
    const parsed = parseHaveringDate(longDateMatch[1]);
    if (parsed !== null) return parsed;
  }

  const slashDateMatch = SLASH_DATE_PATTERN.exec(compact);
  if (slashDateMatch?.[1] !== undefined) {
    const parsed = parseSlashDate(slashDateMatch[1]);
    if (parsed !== null) return parsed;
  }

  return null;
}

interface RenderedRow {
  service: string;
  date: string;
}

function kindForService(service: string): BinKind | null {
  for (const { pattern, kind } of LABEL_PATTERNS) {
    if (pattern.test(service)) return kind;
  }
  return null;
}

export function extractHaveringCollectionsFromRows(rows: ReadonlyArray<RenderedRow>): BinCollection[] {
  const grouped = new Map<string, Set<BinKind>>();

  for (const row of rows) {
    const kind = kindForService(row.service);
    if (kind === null) continue;
    const isoDate = extractDate(row.date);
    if (isoDate === null) continue;
    addCollection(grouped, isoDate, kind);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, kinds]) => ({ date, kinds: [...kinds] }));
}

async function fetchCollectionsFromRenderedPage(
  env: Env,
): Promise<{ raw: unknown; collections: BinCollection[] }> {
  if (env.BROWSER === undefined) {
    throw new ProviderUnavailableError("Browser rendering binding is not configured");
  }

  const browser = await puppeteer.launch(env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.goto(HAVERING_COLLECTION_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#missedWastes tbody tr td", { timeout: 20_000 });

    const rows = await page.$$eval("#missedWastes tbody tr", (trs) =>
      trs
        .map((tr) => {
          const cells = [...tr.querySelectorAll("td")]
            .map((td) => (td.textContent ?? "").replace(/\s+/g, " ").trim());

          return {
            service: cells[1] ?? "",
            date: cells[2] ?? "",
          };
        })
        .filter((row) => row.service.length > 0 && row.date.length > 0),
    );

    return {
      raw: { rows },
      collections: extractHaveringCollectionsFromRows(rows),
    };
  } catch {
    throw new ProviderUnavailableError("Rendered Havering page did not expose collection rows");
  } finally {
    await browser.close();
  }
}

export async function fetchHaveringDebug(
  _today: string,
  env: Env,
): Promise<{ provider: string; parsed: Bins; raw: unknown }> {
  const htmlResult = await fetchCollectionsFromRenderedPage(env);
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

  async fetch(_config: Config, env: Env, today: string): Promise<Bins> {
    const debug = await fetchHaveringDebug(today, env);
    return debug.parsed;
  },
};
