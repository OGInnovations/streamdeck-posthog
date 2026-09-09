/**
 * Settings shared by every action in the plugin, entered once in any action's
 * property inspector under "PostHog connection".
 *
 * These are stored via Stream Deck's global settings, which keeps them out of
 * individual key settings and out of exported profiles.
 */
export type GlobalSettings = {
	/** App host, e.g. `https://us.posthog.com`, `https://eu.posthog.com`, or a self-hosted URL. */
	host?: string;
	/** Personal API key (`phx_...`) with `insight:read` scope. */
	apiKey?: string;
	/** Default project ID, used when a key's insight reference does not carry one. */
	projectId?: string;
};

/** Settings for a single "Insight Value" key. */
export type InsightSettings = {
	/** A pasted insight URL, or a bare insight short ID. */
	insight?: string;
	/** Optional caption rendered under the value. */
	label?: string;
	/** Which series of a multi-series insight to read (0-based). */
	seriesIndex?: number;
	/** How often to poll, in seconds. Clamped to a sane minimum. */
	refreshSeconds?: number;
	/** Abbreviate large numbers, e.g. `12.4k` instead of `12,412`. */
	compact?: boolean;
	/** Decimal places to show. */
	decimals?: number;
	/** Text placed before the value, e.g. `$`. */
	prefix?: string;
	/** Text placed after the value, e.g. `%`. */
	suffix?: string;
};

/** Lower bound on polling, to stay well inside PostHog's API rate limits. */
export const MIN_REFRESH_SECONDS = 15;
export const DEFAULT_REFRESH_SECONDS = 60;

export function refreshInterval(settings: InsightSettings): number {
	const seconds = Number(settings.refreshSeconds);
	if (!Number.isFinite(seconds) || seconds <= 0) {
		return DEFAULT_REFRESH_SECONDS;
	}
	return Math.max(MIN_REFRESH_SECONDS, Math.round(seconds));
}
