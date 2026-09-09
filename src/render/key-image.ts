/**
 * Draws a key as an SVG image.
 *
 * Stream Deck's own title rendering gives one font size and one colour for the
 * whole title, which leaves a value and its caption competing for the same
 * 72x72 space and reading as one indistinct block. Generating the image
 * instead allows a typographic hierarchy — a large value, a quiet caption, a
 * trend line — and a background that separates the key from its neighbours.
 *
 * The canvas is authored at 144x144, the resolution Stream Deck asks for on
 * retina displays, and scales down cleanly for the hardware.
 */
import { escapeXml, fitFontSize, measure, truncate } from "./text.js";
import { resolveTheme, TREND_COLORS, WARNING_COLOR, type Theme, type ThemeName } from "./theme.js";

const SIZE = 144;
const PADDING = 10;
const CONTENT_WIDTH = SIZE - PADDING * 2;
const FONTS = "-apple-system, 'SF Pro Display', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

/** What to draw on the key. */
export type KeyContent = {
	/** The formatted value, e.g. `18.4k`. */
	value: string;
	/** Optional caption above the value. */
	caption?: string;
	/** Change against the previous point, as a fraction; omit to hide. */
	delta?: number;
	/** Series points for the sparkline; omit to hide. */
	points?: number[];
};

export type KeyStyle = {
	theme?: ThemeName;
	customTheme?: Partial<Theme>;
	/** Draw the trend sparkline when points are available. */
	sparkline?: boolean;
	/** Cap on the value's font size, for keys that should read as quieter. */
	maxValueSize?: number;
	/** Treat a falling value as the good direction, e.g. for error rates. */
	invertTrend?: boolean;
};

/**
 * Renders the value state of a key.
 * @param content What to draw.
 * @param style How to draw it.
 * @returns An SVG data URI for `setImage`.
 */
export function renderValue(content: KeyContent, style: KeyStyle = {}): string {
	const theme = resolveTheme(style.theme, style.customTheme);
	const showSparkline = style.sparkline !== false && (content.points?.length ?? 0) >= 2;
	const layers: string[] = [background(theme)];

	// The value owns the middle of the key; the caption, delta and sparkline
	// each claim a band, and the value is centred in whatever is left.
	let top = PADDING;
	let bottom = SIZE - PADDING;

	if (content.caption) {
		const size = 17;
		const text = truncate(content.caption.toUpperCase(), CONTENT_WIDTH, size, 1.1);
		layers.push(
			`<text x="${SIZE / 2}" y="${top + size}" fill="${theme.caption}" font-family="${FONTS}"` +
				` font-size="${size}" font-weight="600" letter-spacing="1.1" text-anchor="middle"` +
				` opacity="0.95">${escapeXml(text)}</text>`,
		);
		top += size + 8;
	}

	if (showSparkline) {
		const height = 30;
		layers.push(sparkline(content.points!, theme, SIZE - PADDING - height, height));
		bottom -= height + 6;
	}

	if (content.delta !== undefined && Number.isFinite(content.delta)) {
		const size = 18;
		bottom -= size + 2;
		layers.push(delta(content.delta, bottom + size, style.invertTrend === true));
	}

	// A key showing nothing but a value can give it the whole face. Otherwise the
	// value is bounded by the band left over, so a short value like "0.4%" does
	// not grow into the caption above it.
	const alone = !content.caption && !showSparkline && content.delta === undefined;
	const ceiling = alone ? 76 : 58;
	const cap = Math.min(style.maxValueSize ?? ceiling, ceiling, (bottom - top) * 0.92);
	const size = fitFontSize(content.value, CONTENT_WIDTH, Math.floor(cap), 20);
	// Nudge down by roughly the cap height so the value sits optically centred.
	const baseline = (top + bottom) / 2 + size * 0.36;
	layers.push(
		`<text x="${SIZE / 2}" y="${baseline.toFixed(1)}" fill="${theme.value}" font-family="${FONTS}"` +
			` font-size="${size}" font-weight="700" text-anchor="middle">${escapeXml(content.value)}</text>`,
	);

	return wrap(layers);
}

/**
 * Renders the "not configured yet" state.
 * @param message Short instruction, e.g. `Pick insight`.
 * @param style How to draw it.
 * @returns An SVG data URI for `setImage`.
 */
export function renderSetup(message: string, style: KeyStyle = {}): string {
	const theme = resolveTheme(style.theme, style.customTheme);
	return wrap([
		background(theme),
		`<rect x="6" y="6" width="${SIZE - 12}" height="${SIZE - 12}" rx="12" fill="none"` +
			` stroke="${theme.caption}" stroke-width="2" stroke-dasharray="7 6" opacity="0.55"/>`,
		logo(SIZE / 2, 48, 22, theme.accent, 0.9),
		...centeredLines(message, theme.caption, 88, 18),
	]);
}

/**
 * Renders the error state.
 * @param message Short reason, e.g. `Invalid API key`.
 * @param style How to draw it.
 * @returns An SVG data URI for `setImage`.
 */
export function renderError(message: string, style: KeyStyle = {}): string {
	const theme = resolveTheme(style.theme, style.customTheme);
	return wrap([
		background(theme),
		// Warning triangle, drawn as a path so no glyph or emoji font is needed.
		`<path d="M72 26 L96 68 L48 68 Z" fill="none" stroke="${WARNING_COLOR}" stroke-width="6"` +
			` stroke-linejoin="round"/>`,
		`<rect x="69.5" y="42" width="5" height="14" rx="2.5" fill="${WARNING_COLOR}"/>`,
		`<circle cx="72" cy="62" r="3" fill="${WARNING_COLOR}"/>`,
		...centeredLines(message, theme.value, 90, 17),
	]);
}

function wrap(layers: string[]): string {
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
		layers.join("") +
		"</svg>";
	// Stream Deck accepts SVG as a data URI; base64 avoids escaping issues with
	// the `#` in colour values.
	return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function background(theme: Theme): string {
	if (typeof theme.background === "string") {
		return `<rect width="${SIZE}" height="${SIZE}" fill="${theme.background}"/>`;
	}
	const [from, to] = theme.background;
	return (
		`<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
		`<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
		`</linearGradient></defs>` +
		`<rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>`
	);
}

/**
 * Draws the sparkline as a filled area with a line on top.
 * @param points The series to plot.
 * @param theme Palette in use.
 * @param top Y coordinate of the band's top edge.
 * @param height Height of the band.
 * @returns SVG markup.
 */
function sparkline(points: number[], theme: Theme, top: number, height: number): string {
	const usable = points.filter((point) => Number.isFinite(point));
	if (usable.length < 2) {
		return "";
	}

	const min = Math.min(...usable);
	const max = Math.max(...usable);
	const span = max - min;
	const left = PADDING;
	const width = CONTENT_WIDTH;
	// Inset so the line's stroke is not clipped at the band's edges.
	const plotTop = top + 3;
	const plotHeight = height - 6;

	const coords = usable.map((point, index) => {
		const x = left + (width * index) / (usable.length - 1);
		// A flat series would divide by zero; draw it through the middle instead.
		const y = span === 0 ? plotTop + plotHeight / 2 : plotTop + plotHeight * (1 - (point - min) / span);
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	});

	const line = `M${coords.join(" L")}`;
	const area = `${line} L${(left + width).toFixed(1)},${(plotTop + plotHeight).toFixed(1)} L${left},${(
		plotTop + plotHeight
	).toFixed(1)} Z`;

	return (
		`<path d="${area}" fill="${theme.accent}" opacity="0.22"/>` +
		`<path d="${line}" fill="none" stroke="${theme.accent}" stroke-width="2.6"` +
		` stroke-linecap="round" stroke-linejoin="round"/>`
	);
}

/**
 * Draws the change indicator: an arrow and a percentage.
 * @param change Change as a fraction, e.g. `0.12` for +12%.
 * @param baseline Y baseline for the text.
 * @param invertTrend Whether a falling value should read as the good direction.
 * @returns SVG markup.
 */
function delta(change: number, baseline: number, invertTrend: boolean): string {
	const size = 18;
	const rising = change > 0;
	const flat = change === 0;
	// Rising is good by default; for a metric like error rate the user can flip it.
	const good = invertTrend ? !rising : rising;
	const color = flat ? TREND_COLORS.flat : good ? TREND_COLORS.up : TREND_COLORS.down;
	const magnitude = Math.abs(change) * 100;
	const label = `${flat ? 0 : magnitude < 10 ? magnitude.toFixed(1) : Math.round(magnitude)}%`;
	const textWidth = measure(label, size);
	// Both indicators reserve their own space so neither overlaps the text.
	const arrowWidth = 13;
	const totalWidth = textWidth + arrowWidth;
	const startX = (SIZE - totalWidth) / 2;
	const top = baseline - size * 0.72;

	// Arrow drawn as a triangle: an arrow glyph would depend on font coverage.
	const arrow = flat
		? `<rect x="${startX}" y="${(baseline - size * 0.32).toFixed(1)}" width="9" height="2.5" rx="1.25" fill="${color}"/>`
		: rising
			? `<path d="M${startX + 4.5} ${top.toFixed(1)} L${startX + 9} ${(top + 8).toFixed(1)} L${startX} ${(
					top + 8
				).toFixed(1)} Z" fill="${color}"/>`
			: `<path d="M${startX + 4.5} ${(top + 8).toFixed(1)} L${startX} ${top.toFixed(1)} L${startX + 9} ${top.toFixed(
					1,
				)} Z" fill="${color}"/>`;

	return (
		arrow +
		`<text x="${(startX + arrowWidth).toFixed(1)}" y="${baseline.toFixed(1)}" fill="${color}"` +
		` font-family="${FONTS}" font-size="${size}" font-weight="600">${escapeXml(label)}</text>`
	);
}

/**
 * Wraps a short message onto up to two centred lines.
 * @param message The message to draw.
 * @param color Text colour.
 * @param firstBaseline Baseline of the first line.
 * @param size Font size.
 * @returns SVG markup for each line.
 */
function centeredLines(message: string, color: string, firstBaseline: number, size: number): string[] {
	const words = message.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (measure(candidate, size) <= CONTENT_WIDTH || !current) {
			current = candidate;
		} else {
			lines.push(current);
			current = word;
		}
	}
	if (current) {
		lines.push(current);
	}

	// Two lines is all that fits below the icon; the rest is elided.
	const visible = lines.slice(0, 2);
	if (lines.length > 2) {
		visible[1] = truncate(`${visible[1]}…`, CONTENT_WIDTH, size);
	}

	return visible.map(
		(line, index) =>
			`<text x="${SIZE / 2}" y="${firstBaseline + index * (size + 4)}" fill="${color}"` +
			` font-family="${FONTS}" font-size="${size}" font-weight="600" text-anchor="middle">` +
			`${escapeXml(truncate(line, CONTENT_WIDTH, size))}</text>`,
	);
}

/**
 * Draws the bar-chart mark used on the setup state.
 * @param cx Horizontal centre.
 * @param cy Vertical centre.
 * @param size Overall height of the mark.
 * @param color Fill colour.
 * @param opacity Fill opacity.
 * @returns SVG markup.
 */
function logo(cx: number, cy: number, size: number, color: string, opacity: number): string {
	const barWidth = size * 0.26;
	const gap = size * 0.13;
	const heights = [size * 0.5, size * 0.75, size];
	const totalWidth = barWidth * 3 + gap * 2;
	return heights
		.map((height, index) => {
			const x = cx - totalWidth / 2 + index * (barWidth + gap);
			return (
				`<rect x="${x.toFixed(1)}" y="${(cy + size / 2 - height).toFixed(1)}" width="${barWidth.toFixed(1)}"` +
				` height="${height.toFixed(1)}" rx="${(barWidth / 3).toFixed(1)}" fill="${color}" opacity="${opacity}"/>`
			);
		})
		.join("");
}
