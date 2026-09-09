/**
 * Deciding when a value should raise an alert on the key.
 *
 * A key showing a number is passive: you have to be looking at it, and you
 * have to know what a normal number looks like. A threshold turns it into
 * something that tells you when to look.
 *
 * One direction applies to both levels, because a metric is either one you
 * watch for growth or one you watch for decline — never both at once. Setting
 * only one of the two levels is normal and works.
 */
import type { InsightSettings } from "./settings.js";

/** How far past its thresholds a value has gone. */
export type AlertLevel = "warn" | "critical";

/** Parses a threshold, treating blank and unparseable entries as unset. */
function threshold(raw: unknown): number | undefined {
	if (raw === undefined || raw === null || raw === "") {
		return undefined;
	}
	const value = Number(raw);
	return Number.isFinite(value) ? value : undefined;
}

/**
 * Determines whether a value has crossed its thresholds.
 * @param value The value shown on the key.
 * @param settings The key's settings.
 * @returns The level crossed, or `undefined` when the value is within bounds.
 */
export function alertLevel(value: number, settings: InsightSettings): AlertLevel | undefined {
	const direction = settings.alertDirection;
	if (direction !== "above" && direction !== "below") {
		return undefined;
	}

	const warn = threshold(settings.warnAt);
	const critical = threshold(settings.criticalAt);
	const crossed = (limit: number | undefined) =>
		limit !== undefined && (direction === "above" ? value >= limit : value <= limit);

	// Critical wins, so a value past both reports the more serious level
	// regardless of which order the two limits were entered in.
	if (crossed(critical)) {
		return "critical";
	}
	return crossed(warn) ? "warn" : undefined;
}

/**
 * Whether a change in level warrants raising Stream Deck's alert on the key.
 *
 * Alerting on every poll would nag for as long as the value stayed out of
 * bounds, so the deck is alerted only when things get worse: on first entering
 * warning or critical, and on worsening from one to the other. Recovering, or
 * staying at the same level, is silent.
 * @param previous The level last drawn, or `undefined` if the value was in bounds.
 * @param next The level now.
 * @returns `true` when the deck should alert.
 */
export function crossedIntoAlert(previous: AlertLevel | undefined, next: AlertLevel | undefined): boolean {
	if (next === undefined) {
		return false;
	}
	if (previous === undefined) {
		return true;
	}
	return next === "critical" && previous !== "critical";
}
