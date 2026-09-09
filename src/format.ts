/** Formatting numbers to fit a 72x72 key. */
import type { InsightSettings } from "./settings.js";

const UNITS = [
	{ threshold: 1e12, suffix: "T" },
	{ threshold: 1e9, suffix: "B" },
	{ threshold: 1e6, suffix: "M" },
	{ threshold: 1e3, suffix: "k" },
];

/**
 * Formats a value for display on a key.
 * @param value The raw number.
 * @param settings The key's settings, which control compaction and affixes.
 * @returns The display string.
 */
export function formatValue(value: number, settings: InsightSettings): string {
	const decimals = clampDecimals(settings.decimals);
	let text: string;

	if (settings.compact) {
		const unit = UNITS.find(({ threshold }) => Math.abs(value) >= threshold);
		if (unit) {
			// One decimal below 100 keeps "12.4k" legible; above that the extra
			// digit ("230.5k") is wider than a key comfortably fits.
			const scaled = value / unit.threshold;
			const places = Math.abs(scaled) < 100 ? 1 : 0;
			text = `${trimZeros(scaled.toFixed(places))}${unit.suffix}`;
		} else {
			text = trimZeros(value.toFixed(decimals));
		}
	} else {
		text = value.toLocaleString("en-US", {
			minimumFractionDigits: decimals,
			maximumFractionDigits: decimals,
		});
	}

	return `${settings.prefix ?? ""}${text}${settings.suffix ?? ""}`;
}

function clampDecimals(decimals: number | undefined): number {
	const value = Number(decimals);
	if (!Number.isFinite(value)) {
		return 0;
	}
	return Math.min(4, Math.max(0, Math.round(value)));
}

function trimZeros(text: string): string {
	return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

/**
 * Builds the multi-line key title: the value, with an optional caption beneath.
 * @param value Already-formatted value.
 * @param label Caption to show under the value; blank hides the line.
 * @returns The key title.
 */
export function buildTitle(value: string, label: string | undefined): string {
	const caption = label?.trim();
	return caption ? `${value}\n${caption}` : value;
}
