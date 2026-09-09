/**
 * Text measurement for the key renderer.
 *
 * A key image is generated as SVG in the plugin process, where there is no
 * canvas or font metrics to measure against, yet the value has to be scaled to
 * fill the key without overflowing it. These per-character widths approximate
 * the system sans-serif at weight 600 as a fraction of the font size; they are
 * deliberately a little generous, since a value that renders slightly small
 * looks fine while one that overflows is clipped.
 */

/** Fallback width for characters not in the table. */
const DEFAULT_WIDTH = 0.58;

const WIDTHS: Record<string, number> = {
	"0": 0.6, "1": 0.42, "2": 0.6, "3": 0.6, "4": 0.62, "5": 0.6, "6": 0.6, "7": 0.56, "8": 0.6, "9": 0.6,
	".": 0.28, ",": 0.28, " ": 0.26, "-": 0.36, "+": 0.6, "%": 0.86, "$": 0.6, "£": 0.6, "€": 0.6,
	":": 0.28, "/": 0.4, "k": 0.55, "M": 0.86, "B": 0.66, "T": 0.6, "▲": 0.8, "▼": 0.8,
};

/**
 * Estimates the rendered width of a string.
 * @param text The string to measure.
 * @param fontSize Font size in user units.
 * @param letterSpacing Extra spacing applied per character.
 * @returns Estimated width in user units.
 */
export function measure(text: string, fontSize: number, letterSpacing = 0): number {
	let width = 0;
	for (const char of text) {
		width += (WIDTHS[char] ?? DEFAULT_WIDTH) * fontSize + letterSpacing;
	}
	return Math.max(0, width - letterSpacing);
}

/**
 * Picks the largest font size at which `text` fits within `maxWidth`.
 * @param text The string to fit.
 * @param maxWidth Space available, in user units.
 * @param preferred The size to use when the text already fits.
 * @param minimum Never shrink below this, to keep the value legible.
 * @returns The font size to render at.
 */
export function fitFontSize(text: string, maxWidth: number, preferred: number, minimum: number): number {
	const width = measure(text, preferred);
	if (width <= maxWidth) {
		return preferred;
	}
	return Math.max(minimum, Math.floor(preferred * (maxWidth / width)));
}

/** Escapes text for inclusion in SVG markup. */
export function escapeXml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/**
 * Truncates a string to what fits, appending an ellipsis when it has to cut.
 * @param text The string to shorten.
 * @param maxWidth Space available, in user units.
 * @param fontSize Font size the text renders at.
 * @param letterSpacing Extra spacing applied per character.
 * @returns The original or truncated string.
 */
export function truncate(text: string, maxWidth: number, fontSize: number, letterSpacing = 0): string {
	if (measure(text, fontSize, letterSpacing) <= maxWidth) {
		return text;
	}
	const chars = [...text];
	while (chars.length > 1) {
		chars.pop();
		if (measure(`${chars.join("")}…`, fontSize, letterSpacing) <= maxWidth) {
			return `${chars.join("")}…`;
		}
	}
	return "…";
}
