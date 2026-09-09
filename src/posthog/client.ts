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

/** How long a fetched value is reused before another request is made. */
const CACHE_TTL_MS = 10_000;

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
		throw new PostHogError(describeStatus(response.status), response.status);
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
 * PostHog moved insights under `/api/environments/` while keeping
 * `/api/projects/` working; we try projects first and fall back on 404 so the
 * plugin works across both self-hosted and cloud versions.
 * @param connection Host, key and project to read from.
 * @param ref The insight to read.
 * @param seriesIndex Which series of the insight to read.
 * @param options.force Bypass the short-lived cache, e.g. on a key press.
 * @returns The insight's current value.
 */
export async function fetchInsightValue(
	connection: Connection,
	ref: InsightRef,
	seriesIndex: number,
	options: { force?: boolean } = {},
): Promise<InsightResult> {
	const key = `${normaliseHost(connection.host)}|${connection.projectId}|${ref.shortId}|${seriesIndex}`;
	const now = Date.now();
	const entry = cache.get(key);

	if (!options.force && entry) {
		if (entry.inFlight) {
			return entry.inFlight;
		}
		if (entry.value && entry.expiresAt > now) {
			return entry.value;
		}
	}

	const inFlight = load(connection, ref, seriesIndex)
		.then((value) => {
			cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
			return value;
		})
		.catch((err) => {
			cache.delete(key);
			throw err;
		});

	cache.set(key, { ...entry, inFlight, expiresAt: now });
	return inFlight;
}

async function load(connection: Connection, ref: InsightRef, seriesIndex: number): Promise<InsightResult> {
	const query = `insights/?short_id=${encodeURIComponent(ref.shortId)}&refresh=true`;
	let payload: unknown;
	try {
		payload = await request(connection, `/api/projects/${connection.projectId}/${query}`);
	} catch (err) {
		if (err instanceof PostHogError && err.status === 404) {
			payload = await request(connection, `/api/environments/${connection.projectId}/${query}`);
		} else {
			throw err;
		}
	}

	const results = (payload as { results?: unknown[] } | null)?.results;
	const insight = Array.isArray(results) ? results[0] : undefined;
	if (!insight || typeof insight !== "object") {
		throw new PostHogError("Insight not found");
	}

	const record = insight as Record<string, unknown>;
	const extracted = extractValue(record.result, seriesIndex);
	if (!extracted) {
		throw new PostHogError("No numeric value in insight");
	}

	const name = record.name ?? record.derived_name;
	return {
		...extracted,
		insightName: typeof name === "string" && name ? name : undefined,
	};
}

/** Clears the value cache, e.g. after the connection settings change. */
export function clearCache(): void {
	cache.clear();
}
