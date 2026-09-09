/**
 * Reducing a PostHog insight result down to the single number a key can show.
 *
 * Insight results are not one shape: a trend series carries `aggregated_value`
 * (for single-value displays) or `count` plus a `data` array, funnel steps
 * carry `count`, and some queries return a bare number. We probe these in
 * order of specificity rather than assuming an insight type, so a key keeps
 * working when the user switches the insight's display mode.
 */

/** A value read from an insight, plus the context needed to draw it. */
export type InsightValue = {
	value: number;
	/** Series name from PostHog, when it provides one. */
	seriesLabel?: string;
	/** The series over time, when the insight graphs one, for the sparkline. */
	points?: number[];
};

function firstNumber(...candidates: unknown[]): number | undefined {
	for (const candidate of candidates) {
		if (typeof candidate === "number" && Number.isFinite(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

function fromSeries(series: unknown): InsightValue | undefined {
	if (typeof series === "number" && Number.isFinite(series)) {
		return { value: series };
	}
	if (series === null || typeof series !== "object") {
		return undefined;
	}

	const record = series as Record<string, unknown>;
	const data = Array.isArray(record.data) ? record.data : undefined;
	const lastPoint = data?.length ? data[data.length - 1] : undefined;

	const value = firstNumber(record.aggregated_value, record.count, record.value, lastPoint);
	if (value === undefined) {
		return undefined;
	}

	const label = record.label ?? record.name ?? record.custom_name;
	return {
		value,
		seriesLabel: typeof label === "string" ? label : undefined,
		points: data?.every((point) => typeof point === "number") ? (data as number[]) : undefined,
	};
}

/**
 * Extracts a displayable value from an insight's `result`.
 * @param result The `result` field of a PostHog insight.
 * @param seriesIndex Which series to read, 0-based; out-of-range falls back to the first.
 * @returns The value, or `undefined` when the result holds no number we recognise.
 */
export function extractValue(result: unknown, seriesIndex = 0): InsightValue | undefined {
	if (Array.isArray(result)) {
		if (result.length === 0) {
			return undefined;
		}
		const index = seriesIndex >= 0 && seriesIndex < result.length ? seriesIndex : 0;
		// Nested arrays show up in e.g. correlation and retention results.
		return extractValue(result[index], 0) ?? fromSeries(result[index]);
	}
	return fromSeries(result);
}

/**
 * The change between the last two points of a series.
 *
 * Note that the final point of a PostHog trend is usually the period in
 * progress, so this compares an incomplete period against a complete one. It
 * answers "how does today compare with yesterday so far", which is what a
 * glanceable key wants, but it is not a like-for-like comparison.
 * @param points The series over time.
 * @returns The change as a fraction, or `undefined` when it cannot be computed.
 */
export function changeFrom(points: number[] | undefined): number | undefined {
	if (!points || points.length < 2) {
		return undefined;
	}
	const latest = points[points.length - 1]!;
	const previous = points[points.length - 2]!;
	if (!Number.isFinite(latest) || !Number.isFinite(previous) || previous === 0) {
		return undefined;
	}
	return (latest - previous) / Math.abs(previous);
}
