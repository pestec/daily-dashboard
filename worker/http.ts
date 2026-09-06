/** Upstream calls get a hard ceiling: a hanging third party must not hold a
 *  cron invocation open, and must not stall the whole refresh pass. */
const DEFAULT_TIMEOUT_MS = 8_000;

export class UpstreamError extends Error {}

/**
 * Fetches JSON with a timeout.
 *
 * The thrown message never contains the URL. Request URLs here carry API keys
 * in query strings, and these messages travel to the browser in the payload
 * and onto the ?debug overlay.
 */
export async function fetchJson<T>(
  url: string,
  { label, timeoutMs = DEFAULT_TIMEOUT_MS, headers, method, body, rateLimitHint }: {
    label: string;
    timeoutMs?: number;
    headers?: Record<string, string>;
    method?: string;
    body?: BodyInit;
    /** Appended to the 429 message. Lets a caller that already sends a key say
     *  something truer than "an API key would fix this". */
    rateLimitHint?: string;
  },
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      ...(method === undefined ? {} : { method }),
      ...(body === undefined ? {} : { body }),
      ...(headers === undefined ? {} : { headers }),
    });

    if (!response.ok) {
      // 429 from a shared Cloudflare egress IP is common on keyless free
      // tiers and looks identical to a bug on screen, so say what fixes it.
      if (response.status === 429) {
        throw new UpstreamError(
          `${label} rate limited (429) - ${rateLimitHint ?? "an API key would fix this"}`,
        );
      }
      throw new UpstreamError(`${label} responded ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new UpstreamError(`${label} timed out after ${timeoutMs / 1000}s`);
    }
    throw new UpstreamError(`${label} unreachable`);
  } finally {
    clearTimeout(timer);
  }
}
