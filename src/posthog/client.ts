/**
 * Minimal PostHog REST client covering just what the plugin reads.
 *
 * Requests are de-duplicated and cached per (host, project, insight): several
 * keys can point at the same insight, and PostHog rate-limits personal API
 * keys, so one poll should not become five HTTP calls.
 */
import { extractValue, type InsightValue } from "./extract.js";
import type { InsightRef } from "./insight-ref.js";

/** Raised for problems worth surfacing on the key, with a short human message. */
export class PostHogError extends Error {
	constructor(
		message: string,
		readonly status?: number,
		/** Seconds PostHog asked us to wait, from a `Retry-After` header. */
		readonly retryAfterSeconds?: number,
	) {
		super(message);
		this.name = "PostHogError";
	}
}

export type InsightResult = InsightValue & {
	/** The insight's name in PostHog, used as a fallback key caption. */
	insightName?: string;
};

export type Connection = {
	host: string;
	apiKey: string;
	projectId: string;
};

type CacheEntry = {
	expiresAt: number;
	inFlight?: Promise<InsightResult>;
	value?: InsightResult;
};

const cache = new Map<string, CacheEntry>();

/**
 * When a project is rate limited, further requests to it are withheld until
 * this time rather than adding to the flood. Keyed by host and project,
 * because PostHog's limits apply to the key and project, not the insight.
 */
const backoff = new Map<string, { until: number; message: string }>();

/** How long a fetched value is reused before another request is made. */
const CACHE_TTL_MS = 10_000;

/** How long to wait out a rate limit that came with no `Retry-After`. */
const DEFAULT_BACKOFF_MS = 60_000;

/** Requests are aborted rather than left hanging when PostHog is unreachable. */
const REQUEST_TIMEOUT_MS = 15_000;

function normaliseHost(host: string): string {
	const trimmed = host.trim().replace(/\/+$/, "");
	return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function request(connection: Connection, path: string): Promise<unknown> {
	const url = `${normaliseHost(connection.host)}${path}`;
	let response: Response;
	try {
		response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${connection.apiKey}`,
				Accept: "application/json",
			},
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	} catch (err) {
		const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "unreachable";
		throw new PostHogError(`PostHog ${reason}`);
	}

	if (!response.ok) {
		const retryAfter = Number(response.headers.get("retry-after"));
		throw new PostHogError(
			describeStatus(response.status),
			response.status,
			Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
		);
	}

	return response.json();
}

function describeStatus(status: number): string {
	switch (status) {
		case 401:
			return "Invalid API key";
		case 403:
			return "API key lacks insight:read";
		case 404:
			return "Insight or project not found";
		case 429:
			return "Rate limited by PostHog";
		default:
			return `PostHog error ${status}`;
	}
}

/**
 * Fetches an insight and reduces it to a single value.
 *
 * @param connection Host, key and project to read from.
 * @param ref The insight to read.
 * @param seriesIndex Which series of the insight to read.
 * @param options.bypassCache Ignore the plugin's short-lived value cache.
 * @param options.recalculate Make PostHog recompute the insight rather than
 * returning its cached result. Expensive, and it counts against the project's
 * query capacity, so this belongs only on an explicit key press.
 * @returns The insight's current value.
 */
export async function fetchInsightValue(
	connection: Connection,
	ref: InsightRef,
	seriesIndex: number,
	options: { bypassCache?: boolean; recalculate?: boolean } = {},
): Promise<InsightResult> {
	const host = normaliseHost(connection.host);
	const key = `${host}|${connection.projectId}|${ref.shortId}|${seriesIndex}`;
	const now = Date.now();
	const entry = cache.get(key);

	// A rate-limited project stays rate limited for a while; polling through it
	// only deepens the problem, so the wait is served from memory.
	const paused = backoff.get(`${host}|${connection.projectId}`);
	if (paused) {
		if (paused.until > now) {
			throw new PostHogError(paused.message, 429);
		}
		backoff.delete(`${host}|${connection.projectId}`);
	}

	const fresh = options.bypassCache === true || options.recalculate === true;
	if (!fresh && entry) {
		if (entry.inFlight) {
			return entry.inFlight;
		}
		if (entry.value && entry.expiresAt > now) {
			return entry.value;
		}
	}

	const inFlight = load(connection, ref, seriesIndex, options.recalculate === true)
		.then((value) => {
			cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
			return value;
		})
		.catch((err: unknown) => {
			cache.delete(key);
			if (err instanceof PostHogError && err.status === 429) {
				const wait = err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : DEFAULT_BACKOFF_MS;
				backoff.set(`${host}|${connection.projectId}`, {
					until: Date.now() + wait,
					message: err.message,
				});
			}
			throw err;
		});

	cache.set(key, { ...entry, inFlight, expiresAt: now });
	return inFlight;
}

/**
 * Requests an insight.
 *
 * PostHog moved insights under `/api/environments/` while keeping
 * `/api/projects/` working; projects is tried first and falls back on 404 so
 * the plugin works across cloud and self-hosted versions.
 *
 * `refresh` makes PostHog recalculate the insight instead of returning what it
 * has cached. Recalculation is expensive and counts against the project's
 * query capacity, so polling must not ask for it — only an explicit key press
 * does, along with the one retry below.
 * @param connection Host, key and project to read from.
 * @param shortId The insight's short ID.
 * @param refresh Whether to make PostHog recalculate.
 * @returns The parsed response body.
 */
async function requestInsight(connection: Connection, shortId: string, refresh: boolean): Promise<unknown> {
	const params = new URLSearchParams({ short_id: shortId });
	if (refresh) {
		params.set("refresh", "true");
	}
	const query = `insights/?${params.toString()}`;

	try {
		return await request(connection, `/api/projects/${connection.projectId}/${query}`);
	} catch (err) {
		if (err instanceof PostHogError && err.status === 404) {
			return await request(connection, `/api/environments/${connection.projectId}/${query}`);
		}
		throw err;
	}
}

/** Pulls the single insight out of a list response. */
function firstInsight(payload: unknown): Record<string, unknown> {
	const results = (payload as { results?: unknown[] } | null)?.results;
	const insight = Array.isArray(results) ? results[0] : undefined;
	if (!insight || typeof insight !== "object") {
		throw new PostHogError("Insight not found");
	}
	return insight as Record<string, unknown>;
}

async function load(
	connection: Connection,
	ref: InsightRef,
	seriesIndex: number,
	force: boolean,
): Promise<InsightResult> {
	let record = firstInsight(await requestInsight(connection, ref.shortId, force));
	let extracted = extractValue(record.result, seriesIndex);

	if (!extracted && !force) {
		// An insight PostHog has never computed has an empty cached result. Ask
		// it to calculate once, rather than showing an error until the user
		// happens to open the insight in a browser.
		record = firstInsight(await requestInsight(connection, ref.shortId, true));
		extracted = extractValue(record.result, seriesIndex);
	}

	if (!extracted) {
		throw new PostHogError("No numeric value in insight");
	}

	const name = record.name ?? record.derived_name;
	return {
		...extracted,
		insightName: typeof name === "string" && name ? name : undefined,
	};
}

/** Clears the value cache and any rate-limit wait, e.g. after the connection settings change. */
export function clearCache(): void {
	cache.clear();
	backoff.clear();
}
